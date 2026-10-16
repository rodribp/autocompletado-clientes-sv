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

// Option codes of the portal's item pop-up (`<nuevo-item-doc>`).
export const ITEM_TYPES = {
  '1': 'Bien',
  '2': 'Servicio',
  '3': 'Bien y servicio',
} as const;

export type ItemType = keyof typeof ITEM_TYPES;

export function isItemType(v: unknown): v is ItemType {
  return typeof v === 'string' && v in ITEM_TYPES;
}

// Only `G` carries IVA, so only `G` prices change between CF and CCF.
export const SALE_TYPES = {
  G: 'Gravado',
  E: 'Exento',
  N: 'No sujeto',
} as const;

export type SaleType = keyof typeof SALE_TYPES;

export function isSaleType(v: unknown): v is SaleType {
  return typeof v === 'string' && v in SALE_TYPES;
}

// Fixed national catalog, in the portal's order.
export const UNITS: ReadonlyArray<{ code: string; name: string }> = [
  { code: '33', name: 'Arroba' },
  { code: '20', name: 'Barril' },
  { code: '24', name: 'Botella' },
  { code: '57', name: 'Ciento' },
  { code: '58', name: 'Docena' },
  { code: '22', name: 'Galón' },
  { code: '49', name: 'Gigawatt-hora' },
  { code: '39', name: 'Gramo' },
  { code: '10', name: 'Hectárea' },
  { code: '34', name: 'Kilogramo' },
  { code: '9', name: 'Kilómetro cuadrado' },
  { code: '53', name: 'Kilovoltio' },
  { code: '46', name: 'Kilovoltio-amperio' },
  { code: '43', name: 'Kilowatt' },
  { code: '51', name: 'Kilowatt-hora' },
  { code: '36', name: 'Libra' },
  { code: '23', name: 'Litro' },
  { code: '56', name: 'Medio millar' },
  { code: '45', name: 'Megavoltio-amperio' },
  { code: '42', name: 'Megawatt' },
  { code: '50', name: 'Megawatt-hora' },
  { code: '1', name: 'Metro' },
  { code: '13', name: 'Metro cuadrado' },
  { code: '18', name: 'Metro cúbico' },
  { code: '40', name: 'Miligramo' },
  { code: '26', name: 'Mililitro' },
  { code: '6', name: 'Milímetro' },
  { code: '55', name: 'Millar' },
  { code: '38', name: 'Onza' },
  { code: '37', name: 'Onza troy' },
  { code: '99', name: 'Otra' },
  { code: '32', name: 'Quintal' },
  { code: '30', name: 'Tonelada' },
  { code: '59', name: 'Unidad' },
  { code: '15', name: 'Vara cuadrada' },
  { code: '54', name: 'Voltio' },
  { code: '47', name: 'Voltio-amperio' },
  { code: '44', name: 'Watt' },
  { code: '52', name: 'Watt-hora' },
  { code: '2', name: 'Yarda' },
];

export function isUnit(v: unknown): v is string {
  return typeof v === 'string' && UNITS.some((u) => u.code === v);
}

export function unitName(code: string): string {
  return UNITS.find((u) => u.code === code)?.name ?? code;
}

export interface Product {
  id: string;
  description: string;
  code?: string;
  itemType: ItemType;
  unit: string;
  saleType: SaleType;
  /** What the customer pays, IVA included; CCF gets it without IVA at fill time. */
  price: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type ProductDraft = Omit<Product, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<Product, 'id' | 'createdAt' | 'updatedAt'>>;

export interface ProductsDb {
  schemaVersion: number;
  products: Product[];
}

export function emptyProductsDb(): ProductsDb {
  return { schemaVersion: SCHEMA_VERSION, products: [] };
}
