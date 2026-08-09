// SPDX-License-Identifier: MIT
//
// Modelo de datos. Un solo registro sirve a los dos formularios; la aptitud
// para CCF se deriva, no es un tipo aparte.

/** Códigos del `<select>` de CF. Son cadenas con cero a la izquierda. */
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

/** Actividad económica (CIIU): el ng-select guarda el código y muestra «código - descripción». */
export interface Actividad {
  codigo: string;
  descripcion: string;
}

/**
 * Los tres códigos van siempre juntos: los de distrito solo son únicos dentro
 * de un par (departamento, municipio). Los nombres se cosechan de la página,
 * única fuente legible que hay.
 */
export interface Direccion {
  departamento: string;
  municipio: string;
  distrito: string;
  municipioNombre?: string;
  distritoNombre?: string;
  complemento: string;
}

/**
 * Los documentos se guardan en canónico (solo dígitos): la página descarta los
 * no-dígitos y ngx-mask espera dígitos crudos. El formato se aplica al mostrar.
 */
export interface Customer {
  id: string;
  nombre: string;
  /** Requerido por el formulario CCF; opcional en nuestro modelo. */
  nombreComercial?: string;
  docType: DocType;
  /** Canónico. Solo dígitos para NIT y DUI; cadena cruda para los demás tipos. */
  docNumber: string;
  /** Canónico: solo dígitos, sin el guion de la máscara `000000-0`. */
  nrc?: string;
  actividad?: Actividad;
  direccion: Direccion;
  correo?: string;
  /** Canónico: 8 dígitos sin guion. */
  telefono?: string;
  notas?: string;
  createdAt: number;
  updatedAt: number;
}

/** Un cliente todavía sin `id` ni marcas de tiempo (formulario de alta, captura). */
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

export function emptyDireccion(): Direccion {
  return { departamento: '', municipio: '', distrito: '', complemento: '' };
}

/**
 * Qué le falta a un cliente para recibir un crédito fiscal: `[]` si es apto.
 * Nunca impide guardarlo, un cliente solo-factura es válido. El nombre
 * comercial no cuenta, es opcional pese al `required` del HTML.
 */
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

/**
 * El valor del campo `nit` de CCF, o `null` si el cliente no es apto. Para
 * persona natural el DUI hace de NIT; por eso el input acepta de 9 a 14 dígitos.
 */
export function nitParaCcf(c: Pick<Customer, 'docType' | 'docNumber'>): string | null {
  if (c.docType !== '36' && c.docType !== '13') return null;
  return c.docNumber || null;
}
