// `format*` helpers are display-only: the portal receives raw digits and adds the dashes itself.

import type { DocType } from './types.js';

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
