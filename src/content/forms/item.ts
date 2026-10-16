// The "Ítem DTE" pop-up is the same component in CF and CCF. It may be mounted outside
// `app-facturador-*`, so it is looked up from `document`.

import type { FieldDescriptor } from './schema.js';

/** What gets written into the pop-up: already resolved for the current form type. */
export interface ItemLine {
  itemType: string;
  quantity: string;
  unit: string;
  code: string;
  description: string;
  saleType: string;
  price: string;
}

export function itemModalRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('nuevo-item-doc');
}

// `tipoVenta` goes before `precio`: changing it may re-render the price row.
export const ITEM_FIELDS: FieldDescriptor<ItemLine>[] = [
  { key: 'itemType', control: 'tipo', kind: 'select', order: 10, value: (l) => l.itemType || null },
  { key: 'quantity', control: 'cantidad', kind: 'text', order: 20, value: (l) => l.quantity || null },
  { key: 'unit', control: 'unidad', kind: 'select', order: 30, value: (l) => l.unit || null },
  // Cleared when empty: switching to a product without a code must not keep the previous one.
  { key: 'code', control: 'codigoProducto', kind: 'text', order: 40, maxlength: 25, clearWhenEmpty: true, value: (l) => l.code || null },
  { key: 'description', control: 'producto', kind: 'text', order: 50, maxlength: 1500, value: (l) => l.description || null },
  { key: 'saleType', control: 'tipoVenta', kind: 'select', order: 60, value: (l) => l.saleType || null },
  { key: 'price', control: 'precio', kind: 'text', order: 70, value: (l) => l.price || null },
];
