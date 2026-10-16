// `format*` helpers are display-only: the portal receives raw digits and adds the dashes itself.

import type { FormType } from './messages.js';
import type { DocType, Product } from './types.js';

export function parseDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D+/g, '');
}

export function squish(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function foldForSearch(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function canonDocNumber(docType: DocType, raw: string): string {
  if (docType === '36' || docType === '13') return parseDigits(raw);
  return squish(raw).toUpperCase().replace(/\s/g, '');
}

export function formatNit(canon: string): string {
  const d = parseDigits(canon);
  if (d.length === 14) return `${d.slice(0, 4)}-${d.slice(4, 10)}-${d.slice(10, 13)}-${d.slice(13)}`;
  if (d.length === 9) return formatDui(d);
  return d;
}

export function formatDui(canon: string): string {
  const d = parseDigits(canon);
  if (d.length === 9) return `${d.slice(0, 8)}-${d.slice(8)}`;
  return d;
}

// Mirrors the portal's `000000-0` mask.
export function formatNrc(canon: string): string {
  const d = parseDigits(canon);
  if (d.length < 2) return d;
  return `${d.slice(0, -1)}-${d.slice(-1)}`;
}

export function formatPhone(canon: string): string {
  const d = parseDigits(canon);
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return d;
}

export function formatDocNumber(docType: DocType, canon: string): string {
  if (docType === '36') return formatNit(canon);
  if (docType === '13') return formatDui(canon);
  return canon;
}

// Label format of the portal's `<ng-select>`: `"71102 - Servicios de ingeniería"`.
export function parseActivityLabel(label: string): { code: string; description: string } | null {
  const match = /^\s*(\S+)\s*-\s*(.+?)\s*$/.exec(label);
  if (!match) return null;

  const [, code, description] = match;
  if (!code || !description) return null;
  return { code, description };
}

export function activityLabel(a: { code: string; description: string }): string {
  return `${a.code} - ${a.description}`;
}

// The pop-up's `precio` mask is `separator.8`: up to 8 decimals.
const PRICE_DECIMALS = 8;
const IVA = 1.13;

// Typed prices: `5`, `5,50` (decimal comma) or `$1,234.50` (comma as thousands separator).
export function parsePrice(raw: string | null | undefined): number | null {
  let s = (raw ?? '').replace(/[\s$]/g, '');
  s = s.includes('.') ? s.replace(/,/g, '') : s.replace(',', '.');
  if (!/^\d+(\.\d{1,8})?$/.test(s)) return null;
  const price = Number(s);
  return price > 0 ? price : null;
}

// CCF expects the price without IVA, because the portal adds it to the subtotal itself.
export function unitPriceFor(p: Pick<Product, 'price' | 'saleType'>, formType: FormType): string {
  return formatAmount(formType === 'ccf' && p.saleType === 'G' ? p.price / IVA : p.price);
}

// As the portal's `separator.8` fields take it: no float noise, no trailing zeros, no exponent.
export function formatAmount(n: number): string {
  return n.toFixed(PRICE_DECIMALS).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}
