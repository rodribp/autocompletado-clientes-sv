import { canonDocNumber, parseActivityLabel, parseDigits, squish } from '../../common/normalize.js';
import { emptyAddress, isDocType, type Customer, type DocType } from '../../common/types.js';
import type { CatalogDelta } from '../../common/catalog.js';
import { districtKey, type CatalogEntry } from '../../common/catalog.js';
import { sendToBackground, type CaptureResult, type FieldKey, type FormType } from '../../common/messages.js';
import { q, recipientRoot } from './detect.js';

// `value` Angular assigns to the placeholder option.
const ANGULAR_PLACEHOLDER = /^\d+:\s/;

function selectValue(root: HTMLElement, control: string): { code: string; name: string } | null {
  const el = q<HTMLSelectElement>(root, control);
  if (!el) return null;

  const value = el.value?.trim() ?? '';
  if (!value || ANGULAR_PLACEHOLDER.test(value)) return null;

  const text = el.selectedOptions[0]?.textContent?.trim() ?? '';
  // Labels look like "06 - SAN SALVADOR"; keep just the name.
  const name = text.replace(/^\s*\S+\s*-\s*/, '').trim() || text;
  return { code: value, name };
}

function textValue(root: HTMLElement, control: string): string {
  const el = q<HTMLInputElement | HTMLTextAreaElement>(root, control);
  return squish(el?.value ?? '');
}

export function captureRecipient(formType: FormType): CaptureResult {
  const root = recipientRoot(formType);
  if (!root) return { draft: {}, missing: [] };

  const missing: FieldKey[] = [];
  const draft: Partial<Customer> = { address: emptyAddress() };

  const note = (key: FieldKey, value: string) => {
    if (!value) missing.push(key);
    return value;
  };

  draft.name = note('name', textValue(root, 'nombre'));
  draft.nrc = note('nrc', parseDigits(textValue(root, 'nrc')));

  if (formType === 'ccf') {
    const nit = parseDigits(textValue(root, 'nit'));
    draft.docNumber = note('nit', nit);
    // CCF doesn't ask for the type: 14 digits is a NIT, 9 is a DUI used as NIT.
    draft.docType = nit.length === 14 ? '36' : nit.length === 9 ? '13' : '36';
    draft.tradeName = textValue(root, 'nombreComercial');
    draft.email = textValue(root, 'correo');
    draft.phone = parseDigits(textValue(root, 'telefono'));
  } else {
    const docTypeValue = q<HTMLSelectElement>(root, 'tipoDocumento')?.value?.trim() ?? '';
    const docType: DocType = isDocType(docTypeValue) ? docTypeValue : '36';
    draft.docType = docType;
    draft.docNumber = note('docNumber', canonDocNumber(docType, readCfDocNumber(root)));
    draft.email = textValue(root, 'correoReceptor');
    draft.phone = parseDigits(textValue(root, 'telefonoReceptor'));
  }

  const activity = readActivity(root, formType);
  if (activity) draft.activity = activity;
  else missing.push('activity');

  const department = selectValue(root, 'departamento');
  const municipality = selectValue(root, 'municipio');
  const district = selectValue(root, 'distrito');

  draft.address = {
    department: department?.code ?? '',
    municipality: municipality?.code ?? '',
    district: district?.code ?? '',
    details: textValue(root, 'complemento'),
  };
  if (municipality) draft.address.municipalityName = municipality.name;
  if (district) draft.address.districtName = district.name;

  if (!department) missing.push('department');
  if (!municipality) missing.push('municipality');
  if (!district) missing.push('district');

  return { draft, missing };
}

// In CF the number input has no fixed `formcontrolname`.
function readCfDocNumber(root: HTMLElement): string {
  const docTypeSelect = q<HTMLSelectElement>(root, 'tipoDocumento');
  const row = docTypeSelect?.closest('div.form-group.row');
  const input = row?.querySelector<HTMLInputElement>('input:not([hidden])');
  return input?.value ?? '';
}

function readActivity(root: HTMLElement, formType: FormType): { code: string; description: string } | null {
  const control = formType === 'ccf' ? 'actividadEconomica' : 'codActividad';
  const host = q<HTMLElement>(root, control);
  const label = host?.querySelector('.ng-value-label')?.textContent?.trim() ?? '';

  const parsed = label ? parseActivityLabel(label) : null;
  if (parsed) return parsed;

  const description = textValue(root, 'descActividad');
  return description ? { code: '', description } : null;
}

export function harvestCatalog(formType: FormType): CatalogDelta {
  const root = recipientRoot(formType);
  if (!root) return {};

  const department = q<HTMLSelectElement>(root, 'departamento')?.value?.trim() ?? '';
  if (!department || ANGULAR_PLACEHOLDER.test(department)) return {};

  const delta: CatalogDelta = { municipalities: {}, districts: {} };

  const municipalities = readOptions(root, 'municipio');
  if (municipalities.length > 0) delta.municipalities![department] = municipalities;

  const municipality = q<HTMLSelectElement>(root, 'municipio')?.value?.trim() ?? '';
  if (municipality && !ANGULAR_PLACEHOLDER.test(municipality)) {
    const districts = readOptions(root, 'distrito');
    if (districts.length > 0) delta.districts![districtKey(department, municipality)] = districts;
  }

  return delta;
}

function readOptions(root: HTMLElement, control: string): CatalogEntry[] {
  const el = q<HTMLSelectElement>(root, control);
  if (!el) return [];

  return [...el.options]
    .map((option) => {
      const code = option.value.trim();
      const text = (option.textContent ?? '').trim();
      const name = text.replace(/^\s*\S+\s*-\s*/, '').trim() || text;
      return { code, name };
    })
    .filter((entry) => entry.code !== '' && !ANGULAR_PLACEHOLDER.test(entry.code));
}

// After a fill or a capture the portal has rendered the lists, so learn them.
export async function pushCatalog(formType: FormType): Promise<void> {
  try {
    const delta = harvestCatalog(formType);
    if (!delta.municipalities && !delta.districts) return;
    await sendToBackground('PUT_CATALOG', delta);
  } catch {
    // The catalog is a bonus; a failure here must not affect filling.
  }
}
