import type { Customer } from '../../common/types.js';
import type { FieldKey, FormType } from '../../common/messages.js';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'ngselect'
  | 'dynamicDoc';

export interface FieldDescriptor {
  key: FieldKey;
  /** Absent for `dynamicDoc`, which is discovered at runtime. */
  control?: string;
  kind: FieldKind;
  /** The cascade and the deferred field rely on this order. */
  order: number;
  /** Not reported if missing from the DOM. */
  optional?: boolean;
  maxlength?: number;
  dependsOn?: FieldKey;
  /** `null`: the customer has no value for this field. */
  value(customer: Customer): string | null;
  /** `ngselect` only: the option's visible text. */
  label?(customer: Customer): string;
}

export interface FormSchema {
  id: FormType;
  fields: FieldDescriptor[];
}

export function byOrder(a: FieldDescriptor, b: FieldDescriptor): number {
  return a.order - b.order;
}

export function clamp(value: string, maxlength?: number): string {
  return typeof maxlength === 'number' ? value.slice(0, maxlength) : value;
}
