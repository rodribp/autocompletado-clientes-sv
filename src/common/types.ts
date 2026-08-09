// Option codes of the portal's CF `<select>`.
export const DOC_TYPES = {
  '36': 'NIT',
  '13': 'DUI',
  '03': 'Pasaporte',
  '02': 'Carnet de residente',
  '37': 'Otro',
} as const;

export type DocType = keyof typeof DOC_TYPES;

export const DOC_TYPE_CODES = Object.keys(DOC_TYPES) as DocType[];

export function isDocType(v: unknown): v is DocType {
  return typeof v === 'string' && v in DOC_TYPES;
}

export interface Activity {
  code: string;
  description: string;
}

// A district code is only unique within its (department, municipality).
export interface Address {
  department: string;
  municipality: string;
  district: string;
  municipalityName?: string;
  districtName?: string;
  details: string;
}

// NIT, DUI, NRC and phone are stored as digits only: the portal's ngx-mask expects them raw.
export interface Customer {
  id: string;
  name: string;
  /** Optional even though the CCF form marks it `required`. */
  tradeName?: string;
  docType: DocType;
  docNumber: string;
  nrc?: string;
  activity?: Activity;
  address: Address;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type CustomerDraft = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<Customer, 'id' | 'createdAt' | 'updatedAt'>>;

export const SCHEMA_VERSION = 1;

export interface CustomersDb {
  schemaVersion: number;
  customers: Customer[];
}

export function emptyDb(): CustomersDb {
  return { schemaVersion: SCHEMA_VERSION, customers: [] };
}

export function emptyAddress(): Address {
  return { department: '', municipality: '', district: '', details: '' };
}

// Informational, never blocks saving: an invoice-only customer is valid.
export function ccfIssues(c: Pick<Customer, 'docType' | 'docNumber' | 'nrc'>): string[] {
  const issues: string[] = [];

  if (c.docType !== '36' && c.docType !== '13') {
    issues.push('No tiene NIT ni DUI, así que no puede recibir crédito fiscal.');
  } else if (!c.docNumber) {
    issues.push('Falta el número de documento.');
  }

  if (!c.nrc) issues.push('Falta el NRC, obligatorio en crédito fiscal.');

  return issues;
}

// For individuals, the DUI doubles as the NIT.
export function nitForCcf(c: Pick<Customer, 'docType' | 'docNumber'>): string | null {
  if (c.docType !== '36' && c.docType !== '13') return null;
  return c.docNumber || null;
}
