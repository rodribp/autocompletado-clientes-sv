import { DEPARTMENTS, districtKey, readCatalog, type Catalog } from '../common/catalog.js';
import { T } from '../common/i18n.js';
import { canonDocNumber, parseDigits, squish } from '../common/normalize.js';
import { DOC_TYPES, ccfIssues, emptyAddress, isDocType, type Customer, type CustomerDraft } from '../common/types.js';
import { hasErrors, validateDraft, type DraftErrors } from '../common/validate.js';

let catalog: Catalog = { municipalities: {}, districts: {} };
let editingId: string | null = null;

function form(): HTMLFormElement {
  return document.getElementById('customer-form') as HTMLFormElement;
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

  const department = field<HTMLSelectElement>('department');
  department.replaceChildren(
    new Option(T.selectPlaceholder, ''),
    ...DEPARTMENTS.map((d) => new Option(`${d.code} - ${d.name}`, d.code)),
  );

  department.addEventListener('change', () => {
    refreshMunicipalities(department.value, '');
    refreshDistricts(department.value, '', '');
  });

  field<HTMLSelectElement>('municipality').addEventListener('change', () => {
    refreshDistricts(department.value, field<HTMLSelectElement>('municipality').value, '');
  });

  // Validate on blur, not per keystroke: a half-typed NIT would just be red noise.
  for (const name of ['name', 'docNumber', 'nrc', 'email', 'phone', 'activityCode'] as const) {
    field<HTMLInputElement>(name)?.addEventListener('blur', () => showErrors(validateDraft(readDraft())));
  }

  for (const name of ['docType', 'nrc', 'docNumber'] as const) {
    field<HTMLElement>(name)?.addEventListener('change', refreshCcfNotice);
  }
}

export function openEditor(customer: Partial<Customer> | null): void {
  const f = form();
  f.reset();
  clearErrors();

  editingId = customer?.id ?? null;
  (document.getElementById('edit-title') as HTMLElement).textContent = editingId
    ? T.editCustomer
    : T.newCustomer;

  const c = customer ?? {};
  const address = { ...emptyAddress(), ...(c.address ?? {}) };

  field<HTMLInputElement>('name').value = c.name ?? '';
  field<HTMLInputElement>('tradeName').value = c.tradeName ?? '';
  field<HTMLSelectElement>('docType').value = c.docType ?? '36';
  field<HTMLInputElement>('docNumber').value = c.docNumber ?? '';
  field<HTMLInputElement>('nrc').value = c.nrc ?? '';
  field<HTMLInputElement>('email').value = c.email ?? '';
  field<HTMLInputElement>('phone').value = c.phone ?? '';
  field<HTMLInputElement>('activityCode').value = c.activity?.code ?? '';
  field<HTMLInputElement>('activityDescription').value = c.activity?.description ?? '';
  field<HTMLTextAreaElement>('details').value = address.details;
  field<HTMLTextAreaElement>('notes').value = c.notes ?? '';

  field<HTMLSelectElement>('department').value = address.department;
  refreshMunicipalities(address.department, address.municipality, address.municipalityName);
  refreshDistricts(address.department, address.municipality, address.district, address.districtName);
  refreshCcfNotice();
}

// If the stored code isn't in the catalog (e.g. imported), keep it as an extra option.
function fillLearnedSelect(
  select: HTMLSelectElement,
  manual: HTMLInputElement,
  entries: { code: string; name: string }[],
  value: string,
  knownName?: string,
): boolean {
  if (entries.length > 0) {
    select.hidden = false;
    manual.hidden = true;
    select.replaceChildren(
      new Option(T.selectPlaceholder, ''),
      ...entries.map((e) => new Option(`${e.code} - ${e.name}`, e.code)),
    );
    if (value && !entries.some((e) => e.code === value)) {
      select.append(new Option(`${value} - ${knownName ?? '(código guardado)'}`, value));
    }
    select.value = value;
    return true;
  }

  // No catalog: fall back to typing the code by hand.
  select.hidden = true;
  select.replaceChildren(new Option(value || T.selectPlaceholder, value));
  select.value = value;
  manual.hidden = false;
  manual.value = value;
  return false;
}

function refreshMunicipalities(department: string, value: string, knownName?: string): void {
  const known = fillLearnedSelect(
    field<HTMLSelectElement>('municipality'),
    field<HTMLInputElement>('municipalityManual'),
    catalog.municipalities[department] ?? [],
    value,
    knownName,
  );
  (document.getElementById('catalog-notice') as HTMLElement).hidden = known || !department;
  (document.getElementById('catalog-notice') as HTMLElement).textContent = T.municipalitiesNotLearned;
}

function refreshDistricts(department: string, municipality: string, value: string, knownName?: string): void {
  fillLearnedSelect(
    field<HTMLSelectElement>('district'),
    field<HTMLInputElement>('districtManual'),
    catalog.districts[districtKey(department, municipality)] ?? [],
    value,
    knownName,
  );
}

export function readDraft(): CustomerDraft {
  const docTypeRaw = field<HTMLSelectElement>('docType').value;
  const docType = isDocType(docTypeRaw) ? docTypeRaw : '36';

  const municipalitySelect = field<HTMLSelectElement>('municipality');
  const municipalityManual = field<HTMLInputElement>('municipalityManual');
  const districtSelect = field<HTMLSelectElement>('district');
  const districtManual = field<HTMLInputElement>('districtManual');

  const code = parseDigits(field<HTMLInputElement>('activityCode').value);
  const description = squish(field<HTMLInputElement>('activityDescription').value);

  const draft: CustomerDraft = {
    name: squish(field<HTMLInputElement>('name').value),
    tradeName: squish(field<HTMLInputElement>('tradeName').value),
    docType,
    docNumber: canonDocNumber(docType, field<HTMLInputElement>('docNumber').value),
    nrc: parseDigits(field<HTMLInputElement>('nrc').value),
    email: squish(field<HTMLInputElement>('email').value),
    phone: parseDigits(field<HTMLInputElement>('phone').value),
    notes: field<HTMLTextAreaElement>('notes').value.trim(),
    address: {
      department: field<HTMLSelectElement>('department').value,
      municipality: municipalityManual.hidden ? municipalitySelect.value : municipalityManual.value.trim(),
      district: districtManual.hidden ? districtSelect.value : districtManual.value.trim(),
      details: squish(field<HTMLTextAreaElement>('details').value),
    },
  };

  if (code || description) draft.activity = { code, description };
  if (editingId) draft.id = editingId;

  // Readable names let us rebuild the dropdowns if the catalog is lost.
  const municipalityName = nameOfSelected(municipalitySelect);
  const districtName = nameOfSelected(districtSelect);
  if (municipalityName) draft.address.municipalityName = municipalityName;
  if (districtName) draft.address.districtName = districtName;

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

function refreshCcfNotice(): void {
  const notice = document.getElementById('ccf-notice') as HTMLElement;
  const draft = readDraft();
  const issues = ccfIssues({ docType: draft.docType, docNumber: draft.docNumber, nrc: draft.nrc });

  if (issues.length === 0) {
    notice.hidden = true;
    return;
  }

  notice.hidden = false;
  notice.textContent = `${T.notCcfEligible}: ${issues.join(' ')}`;
}

export async function reloadCatalog(): Promise<void> {
  catalog = await readCatalog();
}
