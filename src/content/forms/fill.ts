import { parseDigits, unitPriceFor } from '../../common/normalize.js';
import { validateProduct } from '../../common/validate.js';
import type { Customer, Product } from '../../common/types.js';
import type { FieldKey, FillReport, FormType, SkipReason, SkippedField } from '../../common/messages.js';
import { setNgSelect, setSelect, setText, typeText, waitFor } from '../dom.js';
import { activateRecipientTab, awaitRecipientRoot, q } from './detect.js';
import { CF_KNOWN_CONTROLS, CF_SCHEMA } from './cf.js';
import { CCF_SCHEMA } from './ccf.js';
import { ITEM_FIELDS, itemModalRoot, type ItemLine } from './item.js';
import { byOrder, clamp, type FieldDescriptor, type FormSchema } from './schema.js';

export class FillError extends Error {
  constructor(
    readonly code:
      | 'PAGE_NOT_SUPPORTED'
      | 'PAGE_NOT_READY'
      | 'RECIPIENT_ROOT_MISSING'
      | 'ITEM_MODAL_MISSING'
      | 'INVALID_PRODUCT',
    message: string,
  ) {
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

  // "No stored value" isn't a failure: a customer without an address has no municipality either.
  failed(key: FieldKey): boolean {
    return this.skipped.some((s) => s.key === key && s.reason !== 'EMPTY_VALUE');
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

export async function fillRecipient(customer: Customer, formType: FormType): Promise<FillReport> {
  const root = await awaitRecipientRoot(formType);
  if (!root) {
    throw new FillError('RECIPIENT_ROOT_MISSING', 'No se encontró la sección Receptor.');
  }

  activateRecipientTab();

  const report = new Report(formType);
  await fillFields(root, schemaFor(formType).fields, customer, report, formType);
  return report.finish();
}

// Stored products can be edited by hand, so validate again before touching the portal.
function assertValid(product: Product): void {
  const errors = Object.values(validateProduct(product));
  if (errors.length > 0) throw new FillError('INVALID_PRODUCT', errors.join(' '));
}

// Keeps the quantity the user already typed in the pop-up.
function itemLine(product: Product, formType: FormType, root: HTMLElement): ItemLine {
  const typed = q<HTMLInputElement>(root, 'cantidad')?.value.replace(/,/g, '') ?? '';
  return {
    itemType: product.itemType,
    quantity: Number(typed) > 0 ? typed : '1',
    unit: product.unit,
    code: product.code ?? '',
    description: product.description,
    saleType: product.saleType,
    price: unitPriceFor(product, formType),
  };
}

// Fills the pop-up the user is typing in; confirming stays with the user.
export async function fillItem(product: Product, formType: FormType): Promise<FillReport> {
  const root = itemModalRoot();
  if (!root) throw new FillError('ITEM_MODAL_MISSING', 'The item pop-up is not open.');
  assertValid(product);

  const line = itemLine(product, formType, root);
  const report = new Report(formType);
  await fillFields(root, ITEM_FIELDS, line, report, formType);
  return report.finish();
}

async function fillFields<T>(
  root: HTMLElement,
  fields: FieldDescriptor<T>[],
  data: T,
  report: Report,
  formType: FormType,
): Promise<void> {
  for (const field of [...fields].sort(byOrder)) {
    try {
      await applyField(root, field, data, report, formType);
    } catch (error) {
      report.skip(field.key, 'EXCEPTION', undefined, error instanceof Error ? error.message : String(error));
    }
  }
}

async function applyField<T>(
  root: HTMLElement,
  field: FieldDescriptor<T>,
  data: T,
  report: Report,
  formType: FormType,
): Promise<void> {
  if (field.dependsOn && report.failed(field.dependsOn)) {
    report.skip(field.key, 'PARENT_FAILED');
    return;
  }

  const raw = field.value(data);

  if (raw === null || raw === '') {
    // Don't leave the previous customer's or product's value behind.
    if (field.clearWhenEmpty) {
      const el = q<HTMLInputElement | HTMLTextAreaElement>(root, field.control!);
      if (el?.value) setText(el, '');
    }
    // In CCF a null `nit` isn't missing data: the customer isn't eligible for a CCF.
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
      return applyNgSelectField(root, field, value, data, report);
    case 'dynamicDoc':
      return applyDocNumberField(root, field, value, report);
  }
}

function applyTextField<T>(root: HTMLElement, field: FieldDescriptor<T>, value: string, report: Report): void {
  const el = q<HTMLInputElement | HTMLTextAreaElement>(root, field.control!);
  if (!el) {
    if (!field.optional) report.skip(field.key, 'CONTROL_NOT_FOUND', value);
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

  report.ok(field.key);
}

// ngx-mask and the portal's `oninput` handlers reformat, so compare numbers by digits only,
// and decimals by value (`separator.8` turns `1234.5` into `1,234.5`).
export function valueLanded(actual: string, intended: string): boolean {
  if (/^\d+$/.test(intended)) return parseDigits(actual) === intended;
  if (/^\d+\.\d+$/.test(intended)) return Number(actual.replace(/,/g, '')) === Number(intended);
  return actual.trim() === intended.trim();
}

async function applySelectField<T>(
  root: HTMLElement,
  field: FieldDescriptor<T>,
  value: string,
  report: Report,
): Promise<void> {
  const el = q<HTMLSelectElement>(root, field.control!);
  if (!el) {
    report.skip(field.key, 'CONTROL_NOT_FOUND', value);
    return;
  }

  // Wait for the specific option, not a count change: stale options from a
  // previous fill would satisfy that instantly.
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

async function applyNgSelectField<T>(
  root: HTMLElement,
  field: FieldDescriptor<T>,
  code: string,
  data: T,
  report: Report,
): Promise<void> {
  const host = q<HTMLElement>(root, field.control!);
  if (!host) {
    report.skip(field.key, 'CONTROL_NOT_FOUND', code);
    return;
  }

  const label = field.label?.(data) ?? code;
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

// The CF number field only appears once a type is chosen, and its `formcontrolname` is unknown.
async function applyDocNumberField<T>(
  root: HTMLElement,
  field: FieldDescriptor<T>,
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

// Must run after `tipoDocumento` is set.
export async function discoverDocNumberField(root: HTMLElement): Promise<HTMLInputElement | null> {
  const container = docNumberContainer(root);

  const inContainer = await waitFor(
    () => container?.querySelector<HTMLInputElement>('input:not([hidden]), select') ?? null,
    { root: container ?? root, timeout: 4000 },
  );
  if (inContainer) return inContainer as HTMLInputElement;

  const unknown = [...root.querySelectorAll<HTMLInputElement>('input[formcontrolname], select[formcontrolname]')].filter(
    (el) => !CF_KNOWN_CONTROLS.has(el.getAttribute('formcontrolname') ?? ''),
  );
  if (unknown.length === 1) return unknown[0]!;

  const docTypeSelect = q<HTMLSelectElement>(root, 'tipoDocumento');
  const row = docTypeSelect?.closest('div.form-group.row');
  const positional = row?.querySelector<HTMLInputElement>('input:not([hidden])');
  return positional ?? null;
}

function docNumberContainer(root: HTMLElement): HTMLElement | null {
  const docTypeSelect = q<HTMLSelectElement>(root, 'tipoDocumento');
  const row = docTypeSelect?.closest<HTMLElement>('div.form-group.row');
  if (!row) return null;

  const columns = row.querySelectorAll<HTMLElement>(':scope > div.col-sm-6');
  const second = columns[1];
  if (!second) return row;
  return second.querySelector<HTMLElement>(':scope > div.col-sm-12') ?? second;
}

// Lets us inspect the discovered control without opening DevTools.
function rememberDiscoveredControl(name: string | null): void {
  if (!name) return;
  void chrome.storage.local.get('discovered').then((bag) => {
    const discovered = (bag.discovered ?? {}) as Record<string, unknown>;
    if (discovered.cfDocNumberControl === name) return;
    void chrome.storage.local.set({ discovered: { ...discovered, cfDocNumberControl: name } });
  });
}
