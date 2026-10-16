import type { Customer } from '../../common/types.js';
import type { FieldKey, FormType } from '../../common/messages.js';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'ngselect'
  | 'dynamicDoc';

export interface FieldDescriptor<T = Customer> {
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
  /** Text only: no stored value empties the control instead of keeping what a previous fill left. */
  clearWhenEmpty?: boolean;
  /** `null`: no stored value for this field. */
  value(data: T): string | null;
  /** `ngselect` only: the option's visible text. */
  label?(data: T): string;
}

export interface FormSchema {
  id: FormType;
  fields: FieldDescriptor[];
}

export function byOrder(a: FieldDescriptor<unknown>, b: FieldDescriptor<unknown>): number {
  return a.order - b.order;
}

export function clamp(value: string, maxlength?: number): string {
  return typeof maxlength === 'number' ? value.slice(0, maxlength) : value;
}
