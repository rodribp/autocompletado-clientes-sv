// SPDX-License-Identifier: MIT
//
// El relleno. Principio rector: **un campo que falla no cancela el resto**;
// se anota en el informe y se sigue adelante.

import { parseDigits } from '../../common/normalize.js';
import type { Customer } from '../../common/types.js';
import type { FieldKey, FillReport, FormType, SkipReason, SkippedField } from '../../common/messages.js';
import { setNgSelect, setSelect, setText, typeText, waitFor } from '../dom.js';
import { activateReceptorTab, awaitReceptorRoot, q } from './detect.js';
import { CF_KNOWN_CONTROLS, CF_SCHEMA } from './cf.js';
import { CCF_SCHEMA } from './ccf.js';
import { byOrder, clamp, type FieldDescriptor, type FormSchema } from './schema.js';

export class FillError extends Error {
  constructor(readonly code: 'PAGE_NOT_SUPPORTED' | 'PAGE_NOT_READY' | 'RECEPTOR_ROOT_MISSING', message: string) {
    super(message);
    this.name = 'FillError';
  }
}

class Report {
  readonly filled: FieldKey[] = [];
  readonly skipped: SkippedField[] = [];
  private readonly startedAt = Date.now();

  constructor(private readonly formType: FormType) {}

  ok(key: FieldKey): void {
    this.filled.push(key);
  }

  skip(key: FieldKey, reason: SkipReason, intended?: string, hint?: string): void {
    const entry: SkippedField = { key, reason };
    if (intended) entry.intended = intended;
    if (hint) entry.hint = hint;
    this.skipped.push(entry);
  }

  failed(key: FieldKey): boolean {
    return this.skipped.some((s) => s.key === key);
  }

  finish(): FillReport {
    return {
      formType: this.formType,
      filled: this.filled,
      skipped: this.skipped,
      durationMs: Date.now() - this.startedAt,
    };
  }
}

export function schemaFor(formType: FormType): FormSchema {
  return formType === 'ccf' ? CCF_SCHEMA : CF_SCHEMA;
}

export async function fillReceptor(customer: Customer, formType: FormType): Promise<FillReport> {
  const root = await awaitReceptorRoot(formType);
  if (!root) {
    throw new FillError('RECEPTOR_ROOT_MISSING', 'No se encontró la sección Receptor.');
  }

  activateReceptorTab();

  const report = new Report(formType);
  const schema = schemaFor(formType);

  for (const field of [...schema.fields].sort(byOrder)) {
    try {
      await applyField(root, field, customer, report, formType);
    } catch (error) {
      report.skip(field.key, 'EXCEPTION', undefined, error instanceof Error ? error.message : String(error));
    }
  }

  return report.finish();
}

async function applyField(
  root: HTMLElement,
  field: FieldDescriptor,
  customer: Customer,
  report: Report,
  formType: FormType,
): Promise<void> {
  if (field.dependsOn && report.failed(field.dependsOn)) {
    report.skip(field.key, 'PARENT_FAILED');
    return;
  }

  const raw = field.value(customer);

  if (raw === null || raw === '') {
    // En CCF, un `nit` nulo no es «sin dato»: es un cliente que no puede
    // recibir crédito fiscal, y merece un aviso distinto.
    if (formType === 'ccf' && field.key === 'nit') {
      report.skip(field.key, 'NOT_ELIGIBLE_CCF');
    } else {
      report.skip(field.key, 'EMPTY_VALUE');
    }
    return;
  }

  const value = clamp(raw, field.maxlength);

  switch (field.kind) {
    case 'text':
    case 'textarea':
      return applyTextField(root, field, value, report);
    case 'select':
      return applySelectField(root, field, value, report);
    case 'ngselect':
      return applyNgSelectField(root, field, value, customer, report);
    case 'dynamicDoc':
      return applyDocNumberField(root, field, value, report);
  }
}

function applyTextField(root: HTMLElement, field: FieldDescriptor, value: string, report: Report): void {
  const el = q<HTMLInputElement | HTMLTextAreaElement>(root, field.control!);
  if (!el) {
    if (!field.optional) report.skip(field.key, 'CONTROL_NOT_FOUND', value);
    return;
  }

  setText(el, value);

  // ngx-mask y los `oninput` del portal reformatean por su cuenta, así que
  // comparamos solo dígitos cuando el valor era numérico.
  if (!valueLanded(el.value, value)) {
    typeText(el, value);
    if (!valueLanded(el.value, value)) {
      report.skip(field.key, 'VALUE_MISMATCH', value);
      return;
    }
  }

  report.ok(field.key);
}

/** Si el valor era numérico se comparan dígitos: los guiones los pone el portal. */
function valueLanded(actual: string, intended: string): boolean {
  if (/^\d+$/.test(intended)) return parseDigits(actual) === intended;
  return actual.trim() === intended.trim();
}

async function applySelectField(
  root: HTMLElement,
  field: FieldDescriptor,
  value: string,
  report: Report,
): Promise<void> {
  const el = q<HTMLSelectElement>(root, field.control!);
  if (!el) {
    report.skip(field.key, 'CONTROL_NOT_FOUND', value);
    return;
  }

  // Se espera a que exista **la opción concreta**, no a que cambie la cantidad:
  // tras un relleno previo quedan opciones viejas y eso se cumpliría al
  // instante, con la lista equivocada.
  if (field.dependsOn) {
    const appeared = await waitFor(
      () => ([...el.options].some((o) => o.value.trim() === value) ? true : null),
      { root: el, timeout: 5000 },
    );

    if (!appeared) {
      const reason: SkipReason = el.options.length === 0 ? 'TIMEOUT_CASCADE' : 'OPTION_NOT_FOUND';
      report.skip(
        field.key,
        reason,
        value,
        reason === 'OPTION_NOT_FOUND'
          ? 'Los códigos de distrito solo son únicos dentro de un municipio; revisa que el departamento y el municipio guardados sean los correctos.'
          : undefined,
      );
      return;
    }
  }

  if (!setSelect(el, value)) {
    report.skip(field.key, 'OPTION_NOT_FOUND', value);
    return;
  }

  report.ok(field.key);
}

async function applyNgSelectField(
  root: HTMLElement,
  field: FieldDescriptor,
  code: string,
  customer: Customer,
  report: Report,
): Promise<void> {
  const host = q<HTMLElement>(root, field.control!);
  if (!host) {
    report.skip(field.key, 'CONTROL_NOT_FOUND', code);
    return;
  }

  const label = field.label?.(customer) ?? code;
  const outcome = await setNgSelect(host, code, label);

  if (outcome === 'ok') {
    report.ok(field.key);
    return;
  }

  report.skip(
    field.key,
    outcome === 'disabled' ? 'NGSELECT_DISABLED' : 'NGSELECT_NO_MATCH',
    label,
    `Busca «${code}» a mano en Actividad Económica.`,
  );
}

/**
 * El «Número Documento de Identificación» de CF no existe en el DOM hasta que
 * se elige el tipo, y no conocemos su `formcontrolname`: hay que descubrirlo.
 */
async function applyDocNumberField(
  root: HTMLElement,
  field: FieldDescriptor,
  value: string,
  report: Report,
): Promise<void> {
  const el = await discoverDocNumberField(root);

  if (!el) {
    report.skip(
      field.key,
      'DOC_FIELD_NOT_RENDERED',
      value,
      'Selecciona el tipo de documento en la página y pega el número a mano.',
    );
    return;
  }

  setText(el, value);
  if (!valueLanded(el.value, value)) {
    typeText(el, value);
    if (!valueLanded(el.value, value)) {
      report.skip(field.key, 'VALUE_MISMATCH', value);
      return;
    }
  }

  rememberDiscoveredControl(el.getAttribute('formcontrolname'));
  report.ok(field.key);
}

/** Localiza el input del número, con respaldos. Corre tras fijar `tipoDocumento`. */
export async function discoverDocNumberField(root: HTMLElement): Promise<HTMLInputElement | null> {
  const container = docNumberContainer(root);

  // 1. Esperar a que aparezca en el contenedor esperado.
  const inContainer = await waitFor(
    () => container?.querySelector<HTMLInputElement>('input:not([hidden]), select') ?? null,
    { root: container ?? root, timeout: 4000 },
  );
  if (inContainer) return inContainer as HTMLInputElement;

  // 2. Por descarte: un control con un `formcontrolname` que no conocemos.
  const unknown = [...root.querySelectorAll<HTMLInputElement>('input[formcontrolname], select[formcontrolname]')].filter(
    (el) => !CF_KNOWN_CONTROLS.has(el.getAttribute('formcontrolname') ?? ''),
  );
  if (unknown.length === 1) return unknown[0]!;

  // 3. Posicional: el único input de la misma fila que el `<select>` de tipo.
  const tipo = q<HTMLSelectElement>(root, 'tipoDocumento');
  const row = tipo?.closest('div.form-group.row');
  const positional = row?.querySelector<HTMLInputElement>('input:not([hidden])');
  return positional ?? null;
}

/** El hueco donde CF renderiza el número: segunda columna de la fila del tipo. */
function docNumberContainer(root: HTMLElement): HTMLElement | null {
  const tipo = q<HTMLSelectElement>(root, 'tipoDocumento');
  const row = tipo?.closest<HTMLElement>('div.form-group.row');
  if (!row) return null;

  const columns = row.querySelectorAll<HTMLElement>(':scope > div.col-sm-6');
  const second = columns[1];
  if (!second) return row;
  return second.querySelector<HTMLElement>(':scope > div.col-sm-12') ?? second;
}

/** Anota el `formcontrolname` hallado, para consultarlo sin abrir DevTools. */
function rememberDiscoveredControl(name: string | null): void {
  if (!name) return;
  void chrome.storage.local.get('discovered').then((bag) => {
    const discovered = (bag.discovered ?? {}) as Record<string, unknown>;
    if (discovered.cfDocNumberControl === name) return;
    void chrome.storage.local.set({ discovered: { ...discovered, cfDocNumberControl: name } });
  });
}
