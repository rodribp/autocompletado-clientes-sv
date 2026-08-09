// SPDX-License-Identifier: MIT
//
// Formulario de alta y edición. Municipio y distrito salen del catálogo
// aprendido; si aún no se conoce el departamento, el campo se degrada a un
// input de código en vez de quedar inservible.

import { DEPARTAMENTOS, distritoKey, readCatalog, type Catalog } from '../common/catalog.js';
import { T } from '../common/i18n.js';
import { canonDocNumber, parseDigits, squish } from '../common/normalize.js';
import { DOC_TYPES, ccfIssues, emptyDireccion, isDocType, type Customer, type CustomerDraft } from '../common/types.js';
import { hasErrors, validateDraft, type DraftErrors } from '../common/validate.js';

let catalog: Catalog = { municipios: {}, distritos: {} };
let editingId: string | null = null;

function form(): HTMLFormElement {
  return document.getElementById('form-cliente') as HTMLFormElement;
}

function field<T extends HTMLElement>(name: string): T {
  return form().elements.namedItem(name) as unknown as T;
}

export async function initEditView(): Promise<void> {
  catalog = await readCatalog();

  const docType = field<HTMLSelectElement>('docType');
  docType.replaceChildren(
    ...Object.entries(DOC_TYPES).map(([code, label]) => new Option(label, code)),
  );

  const departamento = field<HTMLSelectElement>('departamento');
  departamento.replaceChildren(
    new Option(T.seleccione, ''),
    ...DEPARTAMENTOS.map((d) => new Option(`${d.codigo} - ${d.nombre}`, d.codigo)),
  );

  departamento.addEventListener('change', () => {
    refreshMunicipios(departamento.value, '');
    refreshDistritos(departamento.value, '', '');
  });

  field<HTMLSelectElement>('municipio').addEventListener('change', () => {
    refreshDistritos(departamento.value, field<HTMLSelectElement>('municipio').value, '');
  });

  // Al salir del campo, no en cada tecla: avisar mientras se teclea un NIT de
  // 14 dígitos sería puro ruido rojo.
  for (const name of ['nombre', 'docNumber', 'nrc', 'correo', 'telefono', 'actividadCodigo'] as const) {
    field<HTMLInputElement>(name)?.addEventListener('blur', () => showErrors(validateDraft(readDraft())));
  }

  for (const name of ['docType', 'nrc', 'docNumber'] as const) {
    field<HTMLElement>(name)?.addEventListener('change', refreshCcfNotice);
  }
}

/** Llena el formulario. `customer` a `null` para un alta en blanco. */
export function openEditor(customer: Partial<Customer> | null): void {
  const f = form();
  f.reset();
  clearErrors();

  editingId = customer?.id ?? null;
  (document.getElementById('titulo-edicion') as HTMLElement).textContent = editingId
    ? T.editarCliente
    : T.nuevoCliente;

  const c = customer ?? {};
  const direccion = { ...emptyDireccion(), ...(c.direccion ?? {}) };

  field<HTMLInputElement>('nombre').value = c.nombre ?? '';
  field<HTMLInputElement>('nombreComercial').value = c.nombreComercial ?? '';
  field<HTMLSelectElement>('docType').value = c.docType ?? '36';
  field<HTMLInputElement>('docNumber').value = c.docNumber ?? '';
  field<HTMLInputElement>('nrc').value = c.nrc ?? '';
  field<HTMLInputElement>('correo').value = c.correo ?? '';
  field<HTMLInputElement>('telefono').value = c.telefono ?? '';
  field<HTMLInputElement>('actividadCodigo').value = c.actividad?.codigo ?? '';
  field<HTMLInputElement>('actividadDescripcion').value = c.actividad?.descripcion ?? '';
  field<HTMLTextAreaElement>('complemento').value = direccion.complemento;
  field<HTMLTextAreaElement>('notas').value = c.notas ?? '';

  field<HTMLSelectElement>('departamento').value = direccion.departamento;
  refreshMunicipios(direccion.departamento, direccion.municipio, direccion.municipioNombre);
  refreshDistritos(direccion.departamento, direccion.municipio, direccion.distrito, direccion.distritoNombre);
  refreshCcfNotice();
}

/**
 * Si no conocemos el departamento pero el cliente ya traía un código —
 * importado de otra máquina, por ejemplo—, se conserva para no perderlo.
 */
function fillLearnedSelect(
  select: HTMLSelectElement,
  manual: HTMLInputElement,
  entries: { codigo: string; nombre: string }[],
  value: string,
  knownName?: string,
): boolean {
  if (entries.length > 0) {
    select.hidden = false;
    manual.hidden = true;
    select.replaceChildren(
      new Option(T.seleccione, ''),
      ...entries.map((e) => new Option(`${e.codigo} - ${e.nombre}`, e.codigo)),
    );
    if (value && !entries.some((e) => e.codigo === value)) {
      select.append(new Option(`${value} - ${knownName ?? '(código guardado)'}`, value));
    }
    select.value = value;
    return true;
  }

  // Sin catálogo: caemos a escribir el código a mano.
  select.hidden = true;
  select.replaceChildren(new Option(value || T.seleccione, value));
  select.value = value;
  manual.hidden = false;
  manual.value = value;
  return false;
}

function refreshMunicipios(departamento: string, value: string, knownName?: string): void {
  const known = fillLearnedSelect(
    field<HTMLSelectElement>('municipio'),
    field<HTMLInputElement>('municipioManual'),
    catalog.municipios[departamento] ?? [],
    value,
    knownName,
  );
  (document.getElementById('aviso-catalogo') as HTMLElement).hidden = known || !departamento;
  (document.getElementById('aviso-catalogo') as HTMLElement).textContent = T.municipioSinCatalogo;
}

function refreshDistritos(departamento: string, municipio: string, value: string, knownName?: string): void {
  fillLearnedSelect(
    field<HTMLSelectElement>('distrito'),
    field<HTMLInputElement>('distritoManual'),
    catalog.distritos[distritoKey(departamento, municipio)] ?? [],
    value,
    knownName,
  );
}

/** Lee el formulario y devuelve un borrador ya canonizado. */
export function readDraft(): CustomerDraft {
  const docTypeRaw = field<HTMLSelectElement>('docType').value;
  const docType = isDocType(docTypeRaw) ? docTypeRaw : '36';

  const municipioSelect = field<HTMLSelectElement>('municipio');
  const municipioManual = field<HTMLInputElement>('municipioManual');
  const distritoSelect = field<HTMLSelectElement>('distrito');
  const distritoManual = field<HTMLInputElement>('distritoManual');

  const codigo = parseDigits(field<HTMLInputElement>('actividadCodigo').value);
  const descripcion = squish(field<HTMLInputElement>('actividadDescripcion').value);

  const draft: CustomerDraft = {
    nombre: squish(field<HTMLInputElement>('nombre').value),
    nombreComercial: squish(field<HTMLInputElement>('nombreComercial').value),
    docType,
    docNumber: canonDocNumber(docType, field<HTMLInputElement>('docNumber').value),
    nrc: parseDigits(field<HTMLInputElement>('nrc').value),
    correo: squish(field<HTMLInputElement>('correo').value),
    telefono: parseDigits(field<HTMLInputElement>('telefono').value),
    notas: field<HTMLTextAreaElement>('notas').value.trim(),
    direccion: {
      departamento: field<HTMLSelectElement>('departamento').value,
      municipio: municipioManual.hidden ? municipioSelect.value : municipioManual.value.trim(),
      distrito: distritoManual.hidden ? distritoSelect.value : distritoManual.value.trim(),
      complemento: squish(field<HTMLTextAreaElement>('complemento').value),
    },
  };

  if (codigo || descripcion) draft.actividad = { codigo, descripcion };
  if (editingId) draft.id = editingId;

  // Los nombres legibles permiten reconstruir los desplegables si se pierde el catálogo.
  const municipioNombre = nameOfSelected(municipioSelect);
  const distritoNombre = nameOfSelected(distritoSelect);
  if (municipioNombre) draft.direccion.municipioNombre = municipioNombre;
  if (distritoNombre) draft.direccion.distritoNombre = distritoNombre;

  return draft;
}

function nameOfSelected(select: HTMLSelectElement): string | undefined {
  if (select.hidden || !select.value) return undefined;
  const text = select.selectedOptions[0]?.textContent ?? '';
  return text.replace(/^\s*\S+\s*-\s*/, '').trim() || undefined;
}

export function showErrors(errors: DraftErrors): boolean {
  clearErrors();
  for (const [key, message] of Object.entries(errors)) {
    const slot = form().querySelector(`[data-error-for="${key}"]`);
    if (slot) slot.textContent = message;
  }
  return !hasErrors(errors);
}

function clearErrors(): void {
  for (const slot of form().querySelectorAll('[data-error-for]')) slot.textContent = '';
}

/** Recuerda, sin bloquear, qué le falta al cliente para un crédito fiscal. */
function refreshCcfNotice(): void {
  const notice = document.getElementById('ccf-aviso') as HTMLElement;
  const draft = readDraft();
  const issues = ccfIssues({ docType: draft.docType, docNumber: draft.docNumber, nrc: draft.nrc });

  if (issues.length === 0) {
    notice.hidden = true;
    return;
  }

  notice.hidden = false;
  notice.textContent = `${T.noAptoCcf}: ${issues.join(' ')}`;
}

/** Refresca el catálogo tras aprender municipios nuevos rellenando un documento. */
export async function reloadCatalog(): Promise<void> {
  catalog = await readCatalog();
}
