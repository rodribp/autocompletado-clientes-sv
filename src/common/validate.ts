// SPDX-License-Identifier: MIT
//
// Validación sobre la forma canónica (solo dígitos): lo que el usuario teclea
// pasa antes por `normalize.ts`, así que aquí nunca llegan guiones.

import { parseDigits } from './normalize.js';
import type { Customer, CustomerDraft, DocType } from './types.js';

export type Field =
  | 'nit'
  | 'dui'
  | 'nrc'
  | 'pasaporte'
  | 'carnetResidente'
  | 'otro'
  | 'correo'
  | 'telefono'
  | 'codActividad';

const RULES: Record<Field, { regex: RegExp; message: string }> = {
  // 14 dígitos (NIT clásico) o 9 (DUI usado como NIT de persona natural).
  // El input del portal declara minlength=9 maxlength=14.
  nit: {
    regex: /^(?:\d{14}|\d{9})$/,
    message: 'El NIT debe tener 14 dígitos, o 9 si usas el DUI como NIT.',
  },
  dui: {
    regex: /^\d{9}$/,
    message: 'El DUI debe tener 9 dígitos.',
  },
  // mask="000000-0" con maxlength=7 ⇒ como mucho 7 dígitos.
  nrc: {
    regex: /^\d{2,7}$/,
    message: 'El NRC debe tener entre 2 y 7 dígitos.',
  },
  pasaporte: {
    regex: /^[A-Z0-9]{5,20}$/i,
    message: 'El pasaporte debe tener entre 5 y 20 caracteres alfanuméricos.',
  },
  carnetResidente: {
    regex: /^[A-Z0-9-]{1,20}$/i,
    message: 'El carnet de residente admite hasta 20 caracteres.',
  },
  otro: {
    regex: /^.{1,50}$/,
    message: 'El documento no puede pasar de 50 caracteres.',
  },
  correo: {
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    message: 'El correo no tiene un formato válido.',
  },
  telefono: {
    regex: /^\d{8}$/,
    message: 'El teléfono debe tener 8 dígitos.',
  },
  codActividad: {
    regex: /^\d{2,6}$/,
    message: 'El código de actividad económica debe tener entre 2 y 6 dígitos.',
  },
};

/** Qué regla aplica al número de documento según el tipo elegido. */
export function docFieldFor(docType: DocType): Field {
  switch (docType) {
    case '36':
      return 'nit';
    case '13':
      return 'dui';
    case '03':
      return 'pasaporte';
    case '02':
      return 'carnetResidente';
    case '37':
      return 'otro';
  }
}

/** `null` si es válido; si no, el mensaje en español. */
export function validateField(field: Field, raw: string): string | null {
  const rule = RULES[field];
  const value = raw ?? '';
  if (value === '') return null; // vacío ≠ inválido; lo obligatorio se decide arriba
  if (field === 'correo' && (value.length < 6 || value.length > 100)) {
    return 'El correo debe tener entre 6 y 100 caracteres.';
  }
  return rule.regex.test(value) ? null : rule.message;
}

/** Límites de longitud que declara el propio formulario del portal. */
const MAX = {
  nombre: 250,
  nombreComercial: 150,
  complemento: 200,
  notas: 500,
} as const;

export type DraftErrors = Partial<
  Record<'nombre' | 'nombreComercial' | 'docNumber' | 'nrc' | 'correo' | 'telefono' | 'actividad' | 'complemento' | 'notas', string>
>;

/**
 * Solo `nombre` y `docNumber` son obligatorios: sin NRC, correo o dirección es
 * un cliente de factura normal. Lo que falte para CCF lo dice `ccfIssues()`.
 */
export function validateDraft(d: Partial<CustomerDraft>): DraftErrors {
  const errors: DraftErrors = {};

  const nombre = (d.nombre ?? '').trim();
  if (!nombre) errors.nombre = 'El nombre es obligatorio.';
  else if (nombre.length > MAX.nombre) errors.nombre = `El nombre no puede pasar de ${MAX.nombre} caracteres.`;

  if ((d.nombreComercial ?? '').length > MAX.nombreComercial) {
    errors.nombreComercial = `El nombre comercial no puede pasar de ${MAX.nombreComercial} caracteres.`;
  }

  const docNumber = (d.docNumber ?? '').trim();
  if (!docNumber) {
    errors.docNumber = 'El número de documento es obligatorio.';
  } else if (d.docType) {
    const err = validateField(docFieldFor(d.docType), docNumber);
    if (err) errors.docNumber = err;
  }

  for (const field of ['nrc', 'correo', 'telefono'] as const) {
    const err = validateField(field, (d[field] ?? '').trim());
    if (err) errors[field] = err;
  }

  if (d.actividad?.codigo) {
    const err = validateField('codActividad', parseDigits(d.actividad.codigo));
    if (err) errors.actividad = err;
  }

  if ((d.direccion?.complemento ?? '').length > MAX.complemento) {
    errors.complemento = `El complemento de dirección no puede pasar de ${MAX.complemento} caracteres.`;
  }

  if ((d.notas ?? '').length > MAX.notas) {
    errors.notas = `Las notas no pueden pasar de ${MAX.notas} caracteres.`;
  }

  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Comprobación de forma usada al importar JSON de otra máquina. */
export function looksLikeCustomer(v: unknown): v is Customer {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.nombre === 'string' && typeof c.docNumber === 'string' && typeof c.docType === 'string';
}
