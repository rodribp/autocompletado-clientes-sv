// Expects canonical input: typed values already went through `normalize.ts` (no dashes).

import { parseDigits } from './normalize.js';
import type { Customer, CustomerDraft, DocType } from './types.js';

export type Field =
  | 'nit'
  | 'dui'
  | 'nrc'
  | 'passport'
  | 'residentCard'
  | 'other'
  | 'email'
  | 'phone'
  | 'activityCode';

const RULES: Record<Field, { regex: RegExp; message: string }> = {
  // 9 digits: an individual's DUI used as NIT.
  nit: {
    regex: /^(?:\d{14}|\d{9})$/,
    message: 'El NIT debe tener 14 dígitos, o 9 si usas el DUI como NIT.',
  },
  dui: {
    regex: /^\d{9}$/,
    message: 'El DUI debe tener 9 dígitos.',
  },
  // The portal's `000000-0` mask: at most 7 digits.
  nrc: {
    regex: /^\d{2,7}$/,
    message: 'El NRC debe tener entre 2 y 7 dígitos.',
  },
  passport: {
    regex: /^[A-Z0-9]{5,20}$/i,
    message: 'El pasaporte debe tener entre 5 y 20 caracteres alfanuméricos.',
  },
  residentCard: {
    regex: /^[A-Z0-9-]{1,20}$/i,
    message: 'El carnet de residente admite hasta 20 caracteres.',
  },
  other: {
    regex: /^.{1,50}$/,
    message: 'El documento no puede pasar de 50 caracteres.',
  },
  email: {
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    message: 'El correo no tiene un formato válido.',
  },
  phone: {
    regex: /^\d{8}$/,
    message: 'El teléfono debe tener 8 dígitos.',
  },
  activityCode: {
    regex: /^\d{2,6}$/,
    message: 'El código de actividad económica debe tener entre 2 y 6 dígitos.',
  },
};

export function docFieldFor(docType: DocType): Field {
  switch (docType) {
    case '36':
      return 'nit';
    case '13':
      return 'dui';
    case '03':
      return 'passport';
    case '02':
      return 'residentCard';
    case '37':
      return 'other';
  }
}

export function validateField(field: Field, raw: string): string | null {
  const rule = RULES[field];
  const value = raw ?? '';
  if (value === '') return null; // empty is not invalid; required fields are checked by the caller
  if (field === 'email' && (value.length < 6 || value.length > 100)) {
    return 'El correo debe tener entre 6 y 100 caracteres.';
  }
  return rule.regex.test(value) ? null : rule.message;
}

// Limits declared by the portal's form.
const MAX = {
  name: 250,
  tradeName: 150,
  details: 200,
  notes: 500,
} as const;

export type DraftErrors = Partial<
  Record<'name' | 'tradeName' | 'docNumber' | 'nrc' | 'email' | 'phone' | 'activity' | 'details' | 'notes', string>
>;

// Missing NRC, email or address is still valid; `ccfIssues()` reports what CCF needs.
export function validateDraft(d: Partial<CustomerDraft>): DraftErrors {
  const errors: DraftErrors = {};

  const name = (d.name ?? '').trim();
  if (!name) errors.name = 'El nombre es obligatorio.';
  else if (name.length > MAX.name) errors.name = `El nombre no puede pasar de ${MAX.name} caracteres.`;

  if ((d.tradeName ?? '').length > MAX.tradeName) {
    errors.tradeName = `El nombre comercial no puede pasar de ${MAX.tradeName} caracteres.`;
  }

  const docNumber = (d.docNumber ?? '').trim();
  if (!docNumber) {
    errors.docNumber = 'El número de documento es obligatorio.';
  } else if (d.docType) {
    const err = validateField(docFieldFor(d.docType), docNumber);
    if (err) errors.docNumber = err;
  }

  for (const field of ['nrc', 'email', 'phone'] as const) {
    const err = validateField(field, (d[field] ?? '').trim());
    if (err) errors[field] = err;
  }

  if (d.activity?.code) {
    const err = validateField('activityCode', parseDigits(d.activity.code));
    if (err) errors.activity = err;
  }

  if ((d.address?.details ?? '').length > MAX.details) {
    errors.details = `El complemento de dirección no puede pasar de ${MAX.details} caracteres.`;
  }

  if ((d.notes ?? '').length > MAX.notes) {
    errors.notes = `Las notas no pueden pasar de ${MAX.notes} caracteres.`;
  }

  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function looksLikeCustomer(v: unknown): v is Customer {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.name === 'string' && typeof c.docNumber === 'string' && typeof c.docType === 'string';
}
