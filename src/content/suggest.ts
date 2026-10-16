// Password-manager-style suggestions under portal fields: products in the item pop-up,
// customers in the Receptor. Light DOM, not shadow DOM, so `aria-activedescendant` can reach the options.

import { ERROR_MESSAGES, T, fieldLabel } from '../common/i18n.js';
import { sendToBackground, type FillReport, type FormType, type Res } from '../common/messages.js';
import { formatDocNumber, formatNrc, formatPrice } from '../common/normalize.js';
import { DOC_TYPES, SALE_TYPES, ccfIssues, type Customer, type Product } from '../common/types.js';
import { pushCatalog } from './forms/capture.js';
import { CF_KNOWN_CONTROLS } from './forms/cf.js';
import { detectFormType, recipientRoot } from './forms/detect.js';
import { FillError, fillItem, fillRecipient } from './forms/fill.js';

const LIST_ID = 'acsv-suggestions';
const LIMIT = 8;

const STYLE = `
.acsv-list { position: absolute; z-index: 1060; top: 100%; left: 0; min-width: 320px; max-width: 480px;
  max-height: 280px; overflow-y: auto; margin: 2px 0 0; padding: 4px; background: #fff; color: #212529;
  border: 1px solid rgba(0, 0, 0, 0.15); border-radius: 4px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: left; }
.acsv-option { padding: 6px 8px; border-radius: 3px; cursor: pointer; }
.acsv-option[aria-selected="true"], .acsv-option:hover { background: #e9f6ee; }
.acsv-title { font-weight: 600; overflow-wrap: anywhere; }
.acsv-meta { color: #5f6b7a; font-size: 12px; }
.acsv-status { padding: 6px 8px; color: #b42318; }
`;

interface Source<T> {
  /** `aria-label` of the list. */
  label: string;
  matches(el: Element, formType: FormType): boolean;
  query(q: string): Promise<Res<T[]>>;
  title(item: T): string;
  meta(item: T, formType: FormType): string;
  fill(item: T, formType: FormType): Promise<FillReport>;
}

const products: Source<Product> = {
  label: 'Productos guardados',
  matches: (el) =>
    el.matches('nuevo-item-doc [formcontrolname="producto"], nuevo-item-doc [formcontrolname="codigoProducto"]'),
  query: (q) => sendToBackground('QUERY_PRODUCTS', { q, limit: LIMIT }),
  title: (p) => p.description,
  meta: (p) =>
    [p.code, formatPrice(p.price), p.saleType === 'G' ? '' : SALE_TYPES[p.saleType]].filter(Boolean).join(' · '),
  fill: fillItem,
};

const customers: Source<Customer> = {
  label: 'Clientes guardados',
  matches: isCustomerSearchField,
  query: (q) => sendToBackground('QUERY_CUSTOMERS', { q, limit: LIMIT }),
  title: (c) => c.name,
  meta: (c, formType) =>
    [
      `${DOC_TYPES[c.docType]} ${formatDocNumber(c.docType, c.docNumber)}`,
      c.nrc ? `NRC ${formatNrc(c.nrc)}` : '',
      formType === 'ccf' && ccfIssues(c).length > 0 ? T.notCcfEligible : '',
    ]
      .filter(Boolean)
      .join(' · '),
  fill: async (c, formType) => {
    const report = await fillRecipient(c, formType);
    // The cascade just rendered municipalities and districts: learn them, as «Rellenar» does.
    void pushCatalog(formType);
    return report;
  },
};

const SOURCES = [products, customers] as Source<unknown>[];

// Name, NRC and NIT, only inside the Receptor: the Emisor reuses the same control names.
function isCustomerSearchField(el: Element, formType: FormType): boolean {
  if (!recipientRoot(formType)?.contains(el)) return false;
  // ng-select's own search box has no `formcontrolname`.
  const name = el.getAttribute('formcontrolname');
  if (!name) return false;
  if (name === 'nombre' || name === 'nrc') return true;
  if (formType === 'ccf') return name === 'nit';
  // CF's document number has no fixed name: it is whatever the known list doesn't cover.
  return !CF_KNOWN_CONTROLS.has(name);
}

let input: HTMLInputElement | null = null;
let list: HTMLElement | null = null;
let source: Source<unknown> | null = null;
let items: unknown[] = [];
let active = -1;
let requestSeq = 0;
// The fill fires synthetic focus/input events on these same fields; they must not reopen the list.
let applying = false;

export function installSuggestions(doc: Document = document): void {
  doc.addEventListener('focusin', onFocusOrInput, true);
  doc.addEventListener('input', onFocusOrInput, true);
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('focusout', () => close(), true);
}

function target(event: Event): { el: HTMLInputElement; src: Source<unknown>; formType: FormType } | null {
  const el = event.target as Element | null;
  if (el?.tagName !== 'INPUT') return null;
  const formType = detectFormType();
  if (!formType) return null;
  const src = SOURCES.find((s) => s.matches(el, formType));
  return src ? { el: el as HTMLInputElement, src, formType } : null;
}

function onFocusOrInput(event: Event): void {
  const t = target(event);
  if (t && !applying) void refresh(t.el, t.src, t.formType);
}

async function refresh(el: HTMLInputElement, src: Source<unknown>, formType: FormType): Promise<void> {
  const seq = ++requestSeq;
  let result;
  try {
    result = await src.query(el.value);
  } catch {
    // After an extension update the old content script loses its context and `sendMessage` throws.
    return;
  }

  // A slower, older answer must not replace a newer one.
  if (seq !== requestSeq || el.ownerDocument.activeElement !== el) return;
  if (!result.ok || result.data.length === 0) {
    close();
    return;
  }
  open(el, src, formType, result.data);
}

function onKeyDown(event: KeyboardEvent): void {
  const t = target(event);
  if (!t) return;

  if (!list || items.length === 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      void refresh(t.el, t.src, t.formType);
    }
    return;
  }

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp':
      event.preventDefault();
      select(active + (event.key === 'ArrowDown' ? 1 : -1));
      return;
    case 'Enter':
      if (active < 0) return;
      event.preventDefault();
      event.stopPropagation();
      void pick(items[active]);
      return;
    case 'Escape':
      // The portal's pop-up closes on Esc too; only our list should.
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
  }
}

function open(el: HTMLInputElement, src: Source<unknown>, formType: FormType, found: unknown[]): void {
  const doc = el.ownerDocument;
  ensureStyle(doc);

  if (input !== el || source !== src || !list?.isConnected) {
    close();
    input = el;
    source = src;
    list = doc.createElement('div');
    list.id = LIST_ID;
    list.className = 'acsv-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', src.label);
    el.insertAdjacentElement('afterend', list);

    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-controls', LIST_ID);
  }

  items = found;
  active = -1;
  list.replaceChildren(...found.map((item, i) => option(doc, src, formType, item, i)));
  el.setAttribute('aria-expanded', 'true');
  el.removeAttribute('aria-activedescendant');
}

function option(doc: Document, src: Source<unknown>, formType: FormType, item: unknown, index: number): HTMLElement {
  const row = doc.createElement('div');
  row.id = `${LIST_ID}-${index}`;
  row.className = 'acsv-option';
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');

  const title = doc.createElement('div');
  title.className = 'acsv-title';
  title.textContent = src.title(item);

  const meta = doc.createElement('div');
  meta.className = 'acsv-meta';
  meta.textContent = src.meta(item, formType);

  row.append(title, meta);
  // `mousedown`, not `click`: keep focus in the field so `focusout` doesn't close the list first.
  row.addEventListener('mousedown', (event) => {
    event.preventDefault();
    void pick(item);
  });
  return row;
}

function select(index: number): void {
  if (!list || !input || items.length === 0) return;
  active = (index + items.length) % items.length;
  for (const [i, row] of [...list.children].entries()) {
    row.setAttribute('aria-selected', String(i === active));
  }
  input.setAttribute('aria-activedescendant', `${LIST_ID}-${active}`);
  list.children[active]?.scrollIntoView?.({ block: 'nearest' });
}

async function pick(item: unknown): Promise<void> {
  const el = input;
  const src = source;
  const formType = detectFormType();
  close();
  if (!el || !src || !formType) return;

  applying = true;
  try {
    const report = await src.fill(item, formType);
    // `NOT_ELIGIBLE_CCF` is already shown on the option itself.
    const failed = report.skipped.filter((s) => s.reason !== 'EMPTY_VALUE' && s.reason !== 'NOT_ELIGIBLE_CCF');
    if (failed.length > 0) showStatus(el, formType, `${T.noFill}: ${failed.map((f) => fieldLabel(f.key)).join(', ')}.`);
  } catch (error) {
    showStatus(
      el,
      formType,
      error instanceof FillError && error.code === 'INVALID_PRODUCT'
        ? `${ERROR_MESSAGES.INVALID_PRODUCT} ${error.message}`
        : `${T.noFill}.`,
    );
  } finally {
    applying = false;
  }
}

// Failing silently would leave half-filled data the user might confirm.
function showStatus(field: HTMLInputElement, formType: FormType, message: string): void {
  // Changing the CF document type re-renders the number field, so it may be gone by now.
  const el = field.isConnected
    ? field
    : recipientRoot(formType)?.querySelector<HTMLInputElement>('[formcontrolname="nombre"]');
  if (!el) return;
  const doc = el.ownerDocument;
  ensureStyle(doc);
  close();

  const status = doc.createElement('div');
  status.className = 'acsv-list acsv-status';
  status.setAttribute('role', 'alert');
  status.textContent = message;
  el.insertAdjacentElement('afterend', status);
  input = el;
  list = status;
}

function close(): void {
  requestSeq++;
  list?.remove();
  list = null;
  items = [];
  active = -1;
  input?.setAttribute('aria-expanded', 'false');
  input?.removeAttribute('aria-activedescendant');
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById('acsv-style')) return;
  const style = doc.createElement('style');
  style.id = 'acsv-style';
  style.textContent = STYLE;
  doc.head.append(style);
}
