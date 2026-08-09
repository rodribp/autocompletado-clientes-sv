// SPDX-License-Identifier: MIT
//
// Descripción declarativa de los formularios: `cf.ts` y `ccf.ts` son solo
// datos, la lógica vive en `fill.ts` y `capture.ts`. Cuando el portal cambie,
// lo normal será tocar una tabla y no un procedimiento.

import type { Customer } from '../../common/types.js';
import type { FieldKey, FormType } from '../../common/messages.js';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'ngselect'
  /** El número de documento de CF: no existe en el DOM hasta elegir el tipo. */
  | 'dynamicDoc';

export interface FieldDescriptor {
  key: FieldKey;
  /** `formcontrolname` del control. Ausente en `dynamicDoc`, que se descubre. */
  control?: string;
  kind: FieldKind;
  /** Orden de escritura. Importa: la cascada y el campo diferido dependen de él. */
  order: number;
  /** Si falta el elemento en el DOM, no es un error digno de reportar. */
  optional?: boolean;
  /** Límite que declara el propio portal; truncamos antes de escribir. */
  maxlength?: number;
  /** Campo del que depende. Si aquel se omitió, este también. */
  dependsOn?: FieldKey;
  /** Valor a escribir. `null` significa «este cliente no tiene ese dato». */
  value(customer: Customer): string | null;
  /** Solo para `ngselect`: el texto visible con el que buscar la opción. */
  label?(customer: Customer): string;
}

export interface FormSchema {
  id: FormType;
  fields: FieldDescriptor[];
}

export function byOrder(a: FieldDescriptor, b: FieldDescriptor): number {
  return a.order - b.order;
}

/** Recorta al límite del portal en vez de dejar que él lo haga a medias. */
export function clamp(value: string, maxlength?: number): string {
  return typeof maxlength === 'number' ? value.slice(0, maxlength) : value;
}
