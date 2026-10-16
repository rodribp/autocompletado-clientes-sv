import type { CatalogDelta } from './catalog.js';
import type { Customer, Product } from './types.js';

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
  | 'RECIPIENT_ROOT_MISSING'
  | 'ITEM_MODAL_MISSING'
  | 'INVALID_PRODUCT'
  | 'NO_TAB'
  | 'TIMEOUT'
  | 'BAD_REQUEST'
  | 'UNKNOWN';

export type FormType = 'cf' | 'ccf';

export type FieldKey =
  | 'docType'
  | 'docNumber'
  | 'nit'
  | 'name'
  | 'tradeName'
  | 'nrc'
  | 'activity'
  | 'activityDescription'
  | 'department'
  | 'municipality'
  | 'district'
  | 'details'
  | 'email'
  | 'phone'
  | 'itemType'
  | 'quantity'
  | 'unit'
  | 'code'
  | 'description'
  | 'saleType'
  | 'price';

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
  /** Value for the "Copiar" (copy) button. */
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

export type ToContentMap = {
  PING: { req: Record<string, never>; res: PingResult };
  FILL_RECIPIENT: { req: { customer: Customer }; res: FillReport };
  CAPTURE_RECIPIENT: { req: Record<string, never>; res: CaptureResult };
  HARVEST_CATALOG: { req: Record<string, never>; res: CatalogDelta };
  DIAGNOSE: { req: Record<string, never>; res: DiagnoseResult };
};

export type ToContentKind = keyof ToContentMap;
export type ToContentMessage = {
  [K in ToContentKind]: Envelope<K, ToContentMap[K]['req']>;
}[ToContentKind];

export type ToBackgroundMap = {
  // Unused for now: reserved for future in-page autocomplete.
  QUERY_CUSTOMERS: { req: { q: string; limit?: number }; res: Customer[] };
  GET_CUSTOMER: { req: { id: string }; res: Customer | null };
  QUERY_PRODUCTS: { req: { q: string; limit?: number }; res: Product[] };
  PUT_CATALOG: { req: CatalogDelta; res: Record<string, never> };
};

export type ToBackgroundKind = keyof ToBackgroundMap;
export type ToBackgroundMessage = {
  [K in ToBackgroundKind]: Envelope<K, ToBackgroundMap[K]['req']>;
}[ToBackgroundKind];

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

// Without a content script (normal after install or update) this returns `Err` instead of throwing.
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
        resolve(err('PAGE_NOT_READY', chrome.runtime.lastError.message ?? 'No content script.'));
        return;
      }
      resolve((response ?? err('UNKNOWN', 'Empty response.')) as Res<ToContentMap[K]['res']>);
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
        resolve(err('UNKNOWN', chrome.runtime.lastError.message ?? 'No service worker.'));
        return;
      }
      resolve((response ?? err('UNKNOWN', 'Empty response.')) as Res<ToBackgroundMap[K]['res']>);
    });
  });

  return withTimeout(attempt, timeoutMs);
}

export function withTimeout<T>(promise: Promise<Res<T>>, ms: number): Promise<Res<T>> {
  return Promise.race([
    promise,
    new Promise<Res<T>>((resolve) =>
      setTimeout(() => resolve(err('TIMEOUT', 'The page did not respond in time.')), ms),
    ),
  ]);
}

// MV3: return `true` synchronously and always call `sendResponse`, or the sender hangs.
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
