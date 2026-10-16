import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const DIST = resolve(process.cwd(), 'dist');
const built = existsSync(resolve(DIST, 'import.js')) && existsSync(resolve(DIST, 'import.html'));
const skip = built ? false : 'dist/ is missing. Run `npm run build` first.';

const CUSTOMER = {
  id: 'ya-existe',
  name: 'Nombre Viejo',
  docType: '36',
  docNumber: '06141201851023',
  address: { department: '', municipality: '', district: '', details: '' },
  createdAt: 1,
  updatedAt: 1,
};

interface Harness {
  window: JSDOM['window'];
  document: Document;
  storage: Record<string, unknown>;
  errors: string[];
  settle(): Promise<void>;
  choose(content: string): Promise<void>;
}

async function mountImport(saved: unknown[] = [], savedProducts: unknown[] = []): Promise<Harness> {
  const dom = new JSDOM(readFileSync(resolve(DIST, 'import.html'), 'utf8'), {
    url: 'chrome-extension://test/import.html',
    runScripts: 'outside-only',
  });

  const { window } = dom;

  const style = window.document.createElement('style');
  style.textContent =
    readFileSync(resolve(DIST, 'popup.css'), 'utf8') + readFileSync(resolve(DIST, 'import.css'), 'utf8');
  window.document.head.append(style);

  const storage: Record<string, unknown> = {};
  if (saved.length > 0) storage.db = { schemaVersion: 1, customers: saved };
  if (savedProducts.length > 0) storage.products = { schemaVersion: 1, products: savedProducts };

  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String((e as ErrorEvent).message)));

  Object.assign(window, {
    chrome: {
      storage: {
        local: {
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
        },
        onChanged: { addListener() {} },
      },
      runtime: { getURL: (p: string) => `chrome-extension://test/${p}` },
      tabs: { async create() {} },
    },
  });

  window.eval(readFileSync(resolve(DIST, 'import.js'), 'utf8'));

  const settle = async () => {
    for (let i = 0; i < 30; i++) await new Promise((r) => window.setTimeout(r, 0));
  };
  await settle();

  const choose = async (content: string) => {
    const input = window.document.getElementById('file') as HTMLInputElement;
    const file = new window.File([content], 'respaldo.json', { type: 'application/json' });
    // `files` is read-only and jsdom has no dialog, so override it by hand.
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  };

  return { window, document: window.document, storage, errors, settle, choose };
}

function backup(customers: unknown[]): string {
  return JSON.stringify({ format: 'autocompletado-clientes-sv', schemaVersion: 1, customers });
}

test('the page starts at the choose-file step', { skip }, async () => {
  const { document, errors } = await mountImport();

  assert.deepEqual(errors, [], 'startup should not throw');
  assert.equal(document.getElementById('step-choose')!.hasAttribute('hidden'), false);
  assert.equal(document.getElementById('step-preview')!.hasAttribute('hidden'), true);
  assert.equal(document.getElementById('step-done')!.hasAttribute('hidden'), true);
});

test('choosing a file shows the preview and writes nothing', { skip }, async () => {
  const { document, storage, errors, choose } = await mountImport([CUSTOMER]);

  await choose(
    backup([
      { ...CUSTOMER, name: 'Nombre Nuevo' },
      { id: 'otro', name: 'Recién Llegado', docType: '36', docNumber: '9', address: CUSTOMER.address },
      { id: 'roto', falta: 'todo' },
    ]),
  );

  assert.deepEqual(errors, [], 'reading the file should not throw');
  assert.equal(document.getElementById('step-preview')!.hasAttribute('hidden'), false, 'the preview should open');
  assert.equal(document.getElementById('n-added')!.textContent, '1');
  assert.equal(document.getElementById('n-updated')!.textContent, '1');
  assert.equal(document.getElementById('n-skipped')!.textContent, '1');
  assert.equal(document.getElementById('li-skipped')!.hasAttribute('hidden'), false);

  const details = document.getElementById('preview-details')!;
  assert.match(details.textContent!, /Recién Llegado/);
  assert.match(details.querySelector('.overwritten')!.textContent!, /Nombre Viejo/);

  const saved = (storage.db as { customers: { name: string }[] }).customers;
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.name, 'Nombre Viejo', 'the preview should not have written');
});

test('confirming writes and shows the result', { skip }, async () => {
  const { document, storage, settle, choose } = await mountImport([CUSTOMER]);

  await choose(
    backup([
      { ...CUSTOMER, name: 'Nombre Nuevo' },
      { id: 'otro', name: 'Recién Llegado', docType: '36', docNumber: '9', address: CUSTOMER.address },
    ]),
  );

  (document.getElementById('btn-confirm') as HTMLButtonElement).click();
  await settle();

  assert.equal(document.getElementById('step-done')!.hasAttribute('hidden'), false);
  assert.match(document.getElementById('report')!.textContent!, /Importados 1, actualizados 1/);

  const saved = (storage.db as { customers: { name: string }[] }).customers;
  assert.equal(saved.length, 2);
  assert.ok(
    saved.some((c) => c.name === 'Nombre Nuevo'),
    'the duplicate should have been overwritten',
  );
});

test('replace warns how many customers would be lost', { skip }, async () => {
  const { document, window, settle, choose } = await mountImport([
    CUSTOMER,
    { ...CUSTOMER, id: 'se-pierde', name: 'No Está En El Archivo' },
  ]);

  await choose(backup([{ ...CUSTOMER, name: 'Nombre Nuevo' }]));

  const warning = document.getElementById('replace-warning')!;
  assert.equal(warning.hasAttribute('hidden'), true, 'merge loses nothing, so no warning');

  const replace = document.querySelector('input[name="mode"][value="replace"]') as HTMLInputElement;
  replace.checked = true;
  replace.dispatchEvent(new window.Event('change', { bubbles: true }));
  await settle();

  assert.equal(warning.hasAttribute('hidden'), false);
  assert.match(warning.textContent!, /Se borrará 1 cliente|Se borrarán 1|borrará/);
});

test('a non-backup file is explained and does not break the page', { skip }, async () => {
  const { document, storage, errors, choose } = await mountImport([CUSTOMER]);

  await choose('esto no es json');

  assert.deepEqual(errors, [], 'a bad file should not throw');
  const error = document.getElementById('error')!;
  assert.equal(error.hasAttribute('hidden'), false);
  assert.match(error.textContent!, /JSON válido/);
  assert.equal(document.getElementById('step-preview')!.hasAttribute('hidden'), true, 'should not advance');
  assert.equal((storage.db as { customers: unknown[] }).customers.length, 1, 'should not touch stored data');
});

const PRODUCT = { id: 'cafe', description: 'Café viejo', itemType: '1', unit: '59', saleType: 'G', price: 5, createdAt: 1, updatedAt: 1 };

test('the preview lists the products to add and overwrite', { skip }, async () => {
  const { document, window, settle, storage, errors, choose } = await mountImport([], [
    PRODUCT,
    { ...PRODUCT, id: 'se-pierde', description: 'No Está' },
  ]);

  await choose(
    JSON.stringify({
      customers: [],
      products: [
        { ...PRODUCT, description: 'Café nuevo', price: 6 },
        { ...PRODUCT, id: 'azucar', description: 'Azúcar', saleType: 'E' },
      ],
    }),
  );

  assert.deepEqual(errors, []);
  const details = document.getElementById('preview-details')!.textContent!;
  assert.match(details, /Productos que se agregarían \(1\)/);
  assert.match(details, /Azúcar \$5\.00 · Exento/);
  assert.match(details, /Productos que se sobrescribirían \(1\)/);
  assert.match(details, /Café viejo→Café nuevo \$5\.00 → \$6\.00/, 'a price change must be visible');

  const replace = document.querySelector('input[name="mode"][value="replace"]') as HTMLInputElement;
  replace.checked = true;
  replace.dispatchEvent(new window.Event('change', { bubbles: true }));
  await settle();
  assert.match(document.getElementById('replace-warning')!.textContent!, /Se borrará 1 producto/);

  const saved = (storage.products as { products: { price: number }[] }).products;
  assert.equal(saved[0]!.price, 5, 'the preview should not have written');
});
