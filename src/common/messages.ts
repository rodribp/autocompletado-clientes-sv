// SPDX-License-Identifier: MIT
//
// Contratos de mensajes entre popup, background y content script.
//
// `QUERY_CUSTOMERS` va de content script a background y se implementa ya
// aunque hoy nadie la use: es la que necesitará el autocompletado en página,
// que vivirá dentro del content script.

import type { CatalogDelta } from './catalog.js';
import type { Customer } from './types.js';

export const PROTOCOL_VERSION = 1;

export interface Envelope<K extends string, P> {
  v: typeof PROTOCOL_VERSION;
  kind: K;
  payload: P;
  requestId: string;
}

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: { code: ErrCode; message: string; details?: unknown } };
export type Res<T> = Ok<T> | Err;

export type ErrCode =
  | 'PAGE_NOT_SUPPORTED'
  | 'PAGE_NOT_READY'
  | 'RECEPTOR_ROOT_MISSING'
  | 'NO_TAB'
  | 'TIMEOUT'
  | 'BAD_REQUEST'
  | 'UNKNOWN';

export type FormType = 'cf' | 'ccf';

export type FieldKey =
  | 'tipoDocumento'
  | 'docNumber'
  | 'nit'
  | 'nombre'
  | 'nombreComercial'
  | 'nrc'
  | 'actividad'
  | 'descActividad'
  | 'departamento'
  | 'municipio'
  | 'distrito'
  | 'complemento'
  | 'correo'
  | 'telefono';

export type SkipReason =
  | 'CONTROL_NOT_FOUND'
  | 'OPTION_NOT_FOUND'
  | 'TIMEOUT_CASCADE'
  | 'PARENT_FAILED'
  | 'NGSELECT_NO_MATCH'
  | 'NGSELECT_DISABLED'
  | 'DOC_FIELD_NOT_RENDERED'
  | 'VALUE_MISMATCH'
  | 'EMPTY_VALUE'
  | 'NOT_ELIGIBLE_CCF'
  | 'EXCEPTION';

export interface SkippedField {
  key: FieldKey;
  reason: SkipReason;
  /** Lo que se pretendía escribir, para ofrecer un botón «Copiar». */
  intended?: string;
  hint?: string;
}

export interface FillReport {
  formType: FormType;
  filled: FieldKey[];
  skipped: SkippedField[];
  durationMs: number;
}

export interface CaptureResult {
  draft: Partial<Customer>;
  missing: FieldKey[];
}

export interface DiagnoseResult {
  formType: FormType;
  found: FieldKey[];
  missing: FieldKey[];
}

export interface PingResult {
  formType: FormType | null;
  ready: boolean;
}

// --------------------------------------------------- popup/página → content

export type ToContentMap = {
  PING: { req: Record<string, never>; res: PingResult };
  FILL_RECEPTOR: { req: { customer: Customer }; res: FillReport };
  CAPTURE_RECEPTOR: { req: Record<string, never>; res: CaptureResult };
  HARVEST_CATALOG: { req: Record<string, never>; res: CatalogDelta };
  DIAGNOSE: { req: Record<string, never>; res: DiagnoseResult };
};

export type ToContentKind = keyof ToContentMap;
export type ToContentMessage = {
  [K in ToContentKind]: Envelope<K, ToContentMap[K]['req']>;
}[ToContentKind];

// ------------------------------------------------------- content → background

export type ToBackgroundMap = {
  QUERY_CUSTOMERS: { req: { q: string; limit?: number }; res: Customer[] };
  GET_CUSTOMER: { req: { id: string }; res: Customer | null };
  PUT_CATALOG: { req: CatalogDelta; res: Record<string, never> };
};

export type ToBackgroundKind = keyof ToBackgroundMap;
export type ToBackgroundMessage = {
  [K in ToBackgroundKind]: Envelope<K, ToBackgroundMap[K]['req']>;
}[ToBackgroundKind];

// ------------------------------------------------------------------ ayudantes

export function envelope<K extends string, P>(kind: K, payload: P): Envelope<K, P> {
  return { v: PROTOCOL_VERSION, kind, payload, requestId: crypto.randomUUID() };
}

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

export function err(code: ErrCode, message: string, details?: unknown): Err {
  return { ok: false, error: { code, message, details } };
}

export function isEnvelope(value: unknown): value is Envelope<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return e.v === PROTOCOL_VERSION && typeof e.kind === 'string' && typeof e.requestId === 'string';
}

/**
 * Devuelve `Err` en vez de lanzar cuando la pestaña no tiene content script,
 * que es lo normal justo tras instalar o actualizar con la pestaña abierta.
 */
export async function sendToTab<K extends ToContentKind>(
  tabId: number,
  kind: K,
  payload: ToContentMap[K]['req'],
  timeoutMs = 15_000,
): Promise<Res<ToContentMap[K]['res']>> {
  const message = envelope(kind, payload);

  const attempt = new Promise<Res<ToContentMap[K]['res']>>((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(err('PAGE_NOT_READY', chrome.runtime.lastError.message ?? 'Sin content script.'));
        return;
      }
      resolve((response ?? err('UNKNOWN', 'Respuesta vacía.')) as Res<ToContentMap[K]['res']>);
    });
  });

  return withTimeout(attempt, timeoutMs);
}

export async function sendToBackground<K extends ToBackgroundKind>(
  kind: K,
  payload: ToBackgroundMap[K]['req'],
  timeoutMs = 10_000,
): Promise<Res<ToBackgroundMap[K]['res']>> {
  const message = envelope(kind, payload);

  const attempt = new Promise<Res<ToBackgroundMap[K]['res']>>((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(err('UNKNOWN', chrome.runtime.lastError.message ?? 'Sin service worker.'));
        return;
      }
      resolve((response ?? err('UNKNOWN', 'Respuesta vacía.')) as Res<ToBackgroundMap[K]['res']>);
    });
  });

  return withTimeout(attempt, timeoutMs);
}

export function withTimeout<T>(promise: Promise<Res<T>>, ms: number): Promise<Res<T>> {
  return Promise.race([
    promise,
    new Promise<Res<T>>((resolve) =>
      setTimeout(() => resolve(err('TIMEOUT', 'La página no respondió a tiempo.')), ms),
    ),
  ]);
}

/**
 * Envuelve un manejador de `onMessage`. Dos detalles que rompen la mensajería
 * de MV3: hay que devolver `true` de forma síncrona, y llamar a `sendResponse`
 * siempre —también al lanzar—, o quien llamó se cuelga hasta el timeout.
 */
export function respondAsync(
  handler: (message: Envelope<string, unknown>, sender: chrome.runtime.MessageSender) => Promise<Res<unknown>>,
) {
  return (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (r: Res<unknown>) => void): boolean => {
    if (!isEnvelope(message)) return false;

    handler(message, sender)
      .then(sendResponse)
      .catch((e: unknown) => {
        sendResponse(err('UNKNOWN', e instanceof Error ? e.message : String(e)));
      });

    return true;
  };
}
