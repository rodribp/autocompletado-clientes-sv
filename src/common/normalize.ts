// SPDX-License-Identifier: MIT
//
// Conversión entre la forma canónica que guardamos (solo dígitos) y la legible
// que mostramos. El portal nunca ve la segunda: pone los guiones él solo.

import type { DocType } from './types.js';

/** Quita todo lo que no sea dígito. La operación canónica del proyecto. */
export function parseDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D+/g, '');
}

/** Recorta espacios y colapsa los internos. Para nombres y direcciones. */
export function squish(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

/** Minúsculas y sin acentos, para que «Peña», «PENA» y «peña» se encuentren. */
export function foldForSearch(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** NIT y DUI son numéricos; el resto, alfanumérico en mayúsculas. */
export function canonDocNumber(docType: DocType, raw: string): string {
  if (docType === '36' || docType === '13') return parseDigits(raw);
  return squish(raw).toUpperCase().replace(/\s/g, '');
}

/** `06141201851023` → `0614-120185-102-3`. Solo para mostrar. */
export function formatNit(canon: string): string {
  const d = parseDigits(canon);
  if (d.length === 14) return `${d.slice(0, 4)}-${d.slice(4, 10)}-${d.slice(10, 13)}-${d.slice(13)}`;
  if (d.length === 9) return formatDui(d);
  return d;
}

/** `012345678` → `01234567-8`. Solo para mostrar. */
export function formatDui(canon: string): string {
  const d = parseDigits(canon);
  if (d.length === 9) return `${d.slice(0, 8)}-${d.slice(8)}`;
  return d;
}

/** `1234567` → `123456-7`, replicando la máscara `000000-0` del portal. */
export function formatNrc(canon: string): string {
  const d = parseDigits(canon);
  if (d.length < 2) return d;
  return `${d.slice(0, -1)}-${d.slice(-1)}`;
}

/** `22221234` → `2222-1234`, replicando la máscara `0000-0000`. */
export function formatTelefono(canon: string): string {
  const d = parseDigits(canon);
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return d;
}

/** Documento formateado según su tipo, listo para mostrar en la lista. */
export function formatDocNumber(docType: DocType, canon: string): string {
  if (docType === '36') return formatNit(canon);
  if (docType === '13') return formatDui(canon);
  return canon;
}

/** `"71102 - Servicios de ingeniería"` → `{ codigo, descripcion }`. */
export function parseActividadLabel(label: string): { codigo: string; descripcion: string } | null {
  const match = /^\s*(\S+)\s*-\s*(.+?)\s*$/.exec(label);
  if (!match) return null;

  const [, codigo, descripcion] = match;
  if (!codigo || !descripcion) return null;
  return { codigo, descripcion };
}

/** La cadena que el `<ng-select>` muestra: `"71102 - Servicios de ingeniería"`. */
export function actividadLabel(a: { codigo: string; descripcion: string }): string {
  return `${a.codigo} - ${a.descripcion}`;
}
