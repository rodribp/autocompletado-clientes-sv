// Smoke tests on the `dist/` bundle (skipped without a build): catch mistyped ids or
// null `namedItem`s that typecheck can't see.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const DIST = resolve(process.cwd(), 'dist');
const built = existsSync(resolve(DIST, 'popup.js')) && existsSync(resolve(DIST, 'popup.html'));
const skip = built ? false : 'dist/ is missing. Run `npm run build` first.';

interface Harness {
  window: JSDOM['window'];
  document: Document;
  storage: Record<string, unknown>;
  errors: string[];
  settle(): Promise<void>;
}

async function mountPopup(options: { tabUrl?: string; pingOk?: boolean } = {}): Promise<Harness> {
  const { tabUrl = 'https://example.com/', pingOk = false } = options;

  const dom = new JSDOM(readFileSync(resolve(DIST, 'popup.html'), 'utf8'), {
    url: 'chrome-extension://test/popup.html',
    runScripts: 'outside-only',
  });

  const { window } = dom;

  // jsdom doesn't load <link>: without injecting the sheet, `getComputedStyle` misses author rules.
  const style = window.document.createElement('style');
  style.textContent = readFileSync(resolve(DIST, 'popup.css'), 'utf8');
  window.document.head.append(style);
  const storage: Record<string, unknown> = {};
  const errors: string[] = [];

  window.addEventListener('error', (e) => errors.push(String((e as ErrorEvent).message)));

  const local = {
    async get(keys?: string | string[] | null) {
      if (keys == null) return { ...storage };
      const list = typeof keys === 'string' ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const key of list) if (key in storage) out[key] = storage[key];
      return out;
    },
    async set(items: Record<string, unknown>) {
      for (const [k, v] of Object.entries(items)) storage[k] = JSON.parse(JSON.stringify(v));
    },
  };

  Object.assign(window, {
    chrome: {
      storage: { local, onChanged: { addListener() {} } },
      runtime: { lastError: undefined, sendMessage() {} },
      tabs: {
        async query() {
          return [{ id: 1, url: tabUrl }];
        },
        sendMessage(_id: number, _msg: unknown, cb: (r: unknown) => void) {
          cb(pingOk ? { ok: true, data: { formType: 'ccf', ready: true } } : undefined);
        },
      },
      scripting: {
        async executeScript() {
          return [];
        },
      },
    },
  });

  // Evaluate the bundle inside the window so it uses its globals.
  window.eval(readFileSync(resolve(DIST, 'popup.js'), 'utf8'));

  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => window.setTimeout(r, 0));
  };
  await settle();

  return { window, document: window.document, storage, errors, settle };
}

test('[hidden] beats any author rule that sets display', { skip }, async () => {
  const { document, window } = await mountPopup();

  // Regression: `.menu-panel` and `.wide` set `display` and always showed despite `hidden`.
  for (const el of document.querySelectorAll<HTMLElement>('[hidden]')) {
    assert.equal(
      window.getComputedStyle(el).display,
      'none',
      `#${el.id || el.className} has [hidden] but is still shown: some CSS rule sets its display.`,
    );
  }
});

test('the three-dot menu opens and closes', { skip }, async () => {
  const { document, window, settle } = await mountPopup();

  const panel = document.getElementById('menu-panel')!;
  const button = document.getElementById('btn-menu') as HTMLButtonElement;
  const visible = () => window.getComputedStyle(panel).display !== 'none';

  assert.equal(visible(), false, 'should start closed');
  assert.equal(button.getAttribute('aria-expanded'), 'false');

  button.click();
  await settle();
  assert.equal(visible(), true, 'a click should open it');
  assert.equal(button.getAttribute('aria-expanded'), 'true');

  button.click();
  await settle();
  assert.equal(visible(), false, 'another click should close it');

  button.click();
  await settle();
  document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await settle();
  assert.equal(visible(), false, 'a click outside should close it');
});

test('the popup starts without throwing and shows the empty state', { skip }, async () => {
  const { document, errors } = await mountPopup();

  assert.deepEqual(errors, [], 'startup should not throw');
  assert.equal(document.getElementById('list-view')!.hasAttribute('hidden'), false);
  assert.equal(document.getElementById('empty')!.hasAttribute('hidden'), false, 'no customers, notice visible');
});

test('off the portal it shows a notice and hides "Guardar cliente actual"', { skip }, async () => {
  const { document } = await mountPopup({ tabUrl: 'https://example.com/' });

  const notice = document.getElementById('notice')!;
  assert.equal(notice.hasAttribute('hidden'), false);
  assert.match(notice.textContent!, /admin\.factura\.gob\.sv/);
  assert.equal(document.getElementById('btn-capture')!.hasAttribute('hidden'), true);
});

test('on a CCF it shows the badge and enables capture', { skip }, async () => {
  const { document } = await mountPopup({ tabUrl: 'https://admin.factura.gob.sv/ccf', pingOk: true });

  assert.equal(document.getElementById('notice')!.hasAttribute('hidden'), true, 'no notice: the page is usable');
  assert.equal(document.getElementById('badge')!.textContent, 'CCF');
  assert.equal(document.getElementById('btn-capture')!.hasAttribute('hidden'), false);
});

test('creating a customer saves it and renders it in the list', { skip }, async () => {
  const { document, window, storage, settle, errors } = await mountPopup();

  (document.getElementById('btn-new') as HTMLButtonElement).click();
  await settle();

  assert.equal(document.getElementById('edit-view')!.hasAttribute('hidden'), false, 'the editor should open');

  const form = document.getElementById('customer-form') as HTMLFormElement;
  const set = (name: string, value: string) => {
    const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
    assert.ok(el, `the form has no "${name}" field`);
    el.value = value;
  };

  set('name', 'Ferretería La Esquina');
  set('docType', '36');
  set('docNumber', '0614-120185-102-3');
  set('nrc', '123456-7');
  set('email', 'pagos@laesquina.sv');
  set('phone', '2222-1234');

  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  assert.deepEqual(errors, [], 'saving should not throw');

  const saved = (storage.db as { customers: Record<string, string>[] }).customers;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.name, 'Ferretería La Esquina');
  assert.equal(saved[0]!.docNumber, '06141201851023', 'should be stored canonical, without dashes');
  assert.equal(saved[0]!.nrc, '1234567');
  assert.equal(saved[0]!.phone, '22221234');

  assert.equal(document.getElementById('list-view')!.hasAttribute('hidden'), false, 'should return to the list');
  assert.equal(document.querySelectorAll('#list .item').length, 1);
  assert.match(document.querySelector('.item-name')!.textContent!, /Ferretería La Esquina/);
});

test('the form rejects a customer without a name and saves nothing', { skip }, async () => {
  const { document, window, storage, settle } = await mountPopup();

  (document.getElementById('btn-new') as HTMLButtonElement).click();
  await settle();

  const form = document.getElementById('customer-form') as HTMLFormElement;
  (form.elements.namedItem('docNumber') as HTMLInputElement).value = '06141201851023';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  assert.equal(document.getElementById('edit-view')!.hasAttribute('hidden'), false, 'should stay in the editor');
  assert.match(form.querySelector('[data-error-for="name"]')!.textContent!, /obligatorio/);
  assert.equal(storage.db, undefined, 'nothing should have been written');
});

test('search filters the list', { skip }, async () => {
  const { document, window, settle } = await mountPopup();

  const search = document.getElementById('search') as HTMLInputElement;

  for (const [name, doc] of [['Peña y Asociados', '06141201851023'], ['Otro Cliente', '012345678']] as const) {
    (document.getElementById('btn-new') as HTMLButtonElement).click();
    await settle();
    const form = document.getElementById('customer-form') as HTMLFormElement;
    (form.elements.namedItem('name') as HTMLInputElement).value = name;
    (form.elements.namedItem('docType') as HTMLSelectElement).value = doc.length === 9 ? '13' : '36';
    (form.elements.namedItem('docNumber') as HTMLInputElement).value = doc;
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  }

  assert.equal(document.querySelectorAll('#list .item').length, 2);

  search.value = 'pena';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await settle();

  assert.equal(document.querySelectorAll('#list .item').length, 1, 'search should ignore accents');
  assert.match(document.querySelector('.item-name')!.textContent!, /Peña/);
});

test('the Productos tab swaps the list and creates a product', { skip }, async () => {
  const { document, window, storage, settle, errors } = await mountPopup();

  (document.getElementById('tab-products') as HTMLButtonElement).click();
  await settle();
  assert.equal(document.getElementById('list-view')!.hasAttribute('hidden'), true);
  assert.equal(document.getElementById('products-view')!.hasAttribute('hidden'), false);
  assert.equal(document.getElementById('tab-products')!.getAttribute('aria-selected'), 'true');

  (document.getElementById('btn-new-product') as HTMLButtonElement).click();
  await settle();
  const form = document.getElementById('product-form') as HTMLFormElement;
  (form.elements.namedItem('description') as HTMLTextAreaElement).value = 'Café molido';
  (form.elements.namedItem('price') as HTMLInputElement).value = '5,50';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  assert.deepEqual(errors, []);
  const saved = (storage.products as { products: Record<string, unknown>[] }).products;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.price, 5.5, 'the decimal comma is understood');
  assert.equal(saved[0]!.unit, '59', 'defaults to Unidad');

  assert.equal(
    document.querySelector('#product-list .item .primary'),
    null,
    'products are used from the portal pop-up, not from a button here',
  );
});

test('a product with a bad price is not saved', { skip }, async () => {
  const { document, window, storage, settle } = await mountPopup();

  (document.getElementById('tab-products') as HTMLButtonElement).click();
  (document.getElementById('btn-new-product') as HTMLButtonElement).click();
  await settle();
  const form = document.getElementById('product-form') as HTMLFormElement;
  (form.elements.namedItem('description') as HTMLTextAreaElement).value = 'Algo';
  (form.elements.namedItem('price') as HTMLInputElement).value = 'gratis';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  assert.match(form.querySelector('[data-error-for="price"]')!.textContent!, /precio/);
  assert.equal(storage.products, undefined);
});
