// Password-manager-style suggestions under the item pop-up's Producto and Código fields.
// Light DOM, not shadow DOM, so `aria-activedescendant` can reach the options.

import { ERROR_MESSAGES, T, fieldLabel } from '../common/i18n.js';
import { sendToBackground } from '../common/messages.js';
import { formatPrice } from '../common/normalize.js';
import { SALE_TYPES, type Product } from '../common/types.js';
import { detectFormType } from './forms/detect.js';
import { FillError, fillItem } from './forms/fill.js';

const FIELDS = 'nuevo-item-doc [formcontrolname="producto"], nuevo-item-doc [formcontrolname="codigoProducto"]';
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

let input: HTMLInputElement | null = null;
let list: HTMLElement | null = null;
let items: Product[] = [];
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

function field(event: Event): HTMLInputElement | null {
  const el = event.target as Element | null;
  return el?.tagName === 'INPUT' && el.matches(FIELDS) ? (el as HTMLInputElement) : null;
}

function onFocusOrInput(event: Event): void {
  const el = field(event);
  if (el && !applying) void refresh(el);
}

async function refresh(el: HTMLInputElement): Promise<void> {
  const seq = ++requestSeq;
  let result;
  try {
    result = await sendToBackground('QUERY_PRODUCTS', { q: el.value, limit: LIMIT });
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
  open(el, result.data);
}

function onKeyDown(event: KeyboardEvent): void {
  const el = field(event);
  if (!el) return;

  if (!list || items.length === 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      void refresh(el);
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
      void pick(items[active]!);
      return;
    case 'Escape':
      // The portal's pop-up closes on Esc too; only our list should.
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
  }
}

function open(el: HTMLInputElement, products: Product[]): void {
  const doc = el.ownerDocument;
  ensureStyle(doc);

  if (input !== el || !list?.isConnected) {
    close();
    input = el;
    list = doc.createElement('div');
    list.id = LIST_ID;
    list.className = 'acsv-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Productos guardados');
    el.insertAdjacentElement('afterend', list);

    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-controls', LIST_ID);
  }

  items = products;
  active = -1;
  list.replaceChildren(...products.map((p, i) => option(doc, p, i)));
  el.setAttribute('aria-expanded', 'true');
  el.removeAttribute('aria-activedescendant');
}

function option(doc: Document, product: Product, index: number): HTMLElement {
  const row = doc.createElement('div');
  row.id = `${LIST_ID}-${index}`;
  row.className = 'acsv-option';
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');

  const title = doc.createElement('div');
  title.className = 'acsv-title';
  title.textContent = product.description;

  const meta = doc.createElement('div');
  meta.className = 'acsv-meta';
  meta.textContent = [
    product.code,
    formatPrice(product.price),
    product.saleType === 'G' ? '' : SALE_TYPES[product.saleType],
  ]
    .filter(Boolean)
    .join(' · ');

  row.append(title, meta);
  // `mousedown`, not `click`: keep focus in the field so `focusout` doesn't close the list first.
  row.addEventListener('mousedown', (event) => {
    event.preventDefault();
    void pick(product);
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

async function pick(product: Product): Promise<void> {
  const el = input;
  const formType = detectFormType();
  close();
  if (!el || !formType) return;

  applying = true;
  try {
    const report = await fillItem(product, formType);
    const failed = report.skipped.filter((s) => s.reason !== 'EMPTY_VALUE');
    if (failed.length > 0) showStatus(el, `${T.noFill}: ${failed.map((f) => fieldLabel(f.key)).join(', ')}.`);
  } catch (error) {
    showStatus(
      el,
      error instanceof FillError && error.code === 'INVALID_PRODUCT'
        ? `${ERROR_MESSAGES.INVALID_PRODUCT} ${error.message}`
        : `${T.noFill}.`,
    );
  } finally {
    applying = false;
  }
}

// Failing silently would leave a half-filled line the user might confirm.
function showStatus(el: HTMLInputElement, message: string): void {
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
