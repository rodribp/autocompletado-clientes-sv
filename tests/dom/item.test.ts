// The item pop-up mounts outside the Receptor; filling it must not touch anything else.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, itemFixtureAvailable, loadFixture, readFixture } from '../helpers/fixtures.ts';
import { ITEM_FIELDS, itemModalRoot } from '../../src/content/forms/item.ts';
import { FillError, fillItem, valueLanded } from '../../src/content/forms/fill.ts';
import { ITEM_TYPES, SALE_TYPES, UNITS, type Product } from '../../src/common/types.ts';

const skip = itemFixtureAvailable() ? false : SKIP_REASON;

const PRODUCT: Product = {
  id: 'p',
  description: 'Café molido 1 lb',
  code: 'CAF-01',
  itemType: '1',
  unit: '36',
  saleType: 'G',
  price: 5,
  createdAt: 0,
  updatedAt: 0,
};

// ngx-bootstrap mounts the modal in a `<modal-container>` at the end of `<body>`.
function loadPageWithModal(): void {
  loadFixture('ccf');
  const container = document.createElement('modal-container');
  container.innerHTML = readFixture('cf-item');
  document.body.append(container);
}

function control(name: string): HTMLInputElement {
  return itemModalRoot()!.querySelector<HTMLInputElement>(`[formcontrolname="${name}"]`)!;
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function controlsOutsideModal(): Map<Control, string> {
  const modal = itemModalRoot()!;
  const snapshot = new Map<Control, string>();
  for (const el of document.querySelectorAll<Control>('input, select, textarea')) {
    if (!modal.contains(el)) snapshot.set(el, el.value);
  }
  return snapshot;
}

test('every item field resolves to a single control inside the pop-up', { skip }, () => {
  loadPageWithModal();
  const root = itemModalRoot();
  assert.ok(root, '<nuevo-item-doc> not found.');

  for (const field of ITEM_FIELDS) {
    const matches: NodeListOf<Element> = root.querySelectorAll(`[formcontrolname="${field.control}"]`);
    assert.equal(matches.length, 1, `"${field.key}" (formcontrolname="${field.control}") resolved to ${matches.length}.`);
  }
});

test('every stored code exists as an option in the pop-up', { skip }, () => {
  loadPageWithModal();
  const root = itemModalRoot()!;
  const options = (control: string) =>
    [...root.querySelectorAll<HTMLOptionElement>(`[formcontrolname="${control}"] option`)].map((o) => o.value.trim());

  assert.deepEqual(options('tipo'), Object.keys(ITEM_TYPES));
  assert.deepEqual(options('tipoVenta'), Object.keys(SALE_TYPES));
  assert.deepEqual(options('unidad'), UNITS.map((u) => u.code), 'the unit catalog changed on the portal');
});

test('fillItem fills the pop-up without IVA on a CCF and touches nothing else', { skip }, async () => {
  loadPageWithModal();
  const before = controlsOutsideModal();

  const report = await fillItem(PRODUCT, 'ccf');

  assert.deepEqual(report.skipped, []);
  const root = itemModalRoot()!;
  const value = (control: string) => root.querySelector<HTMLInputElement>(`[formcontrolname="${control}"]`)!.value;
  assert.equal(value('tipo'), '1');
  assert.equal(value('cantidad'), '1');
  assert.equal(value('unidad'), '36');
  assert.equal(value('codigoProducto'), 'CAF-01');
  assert.equal(value('producto'), 'Café molido 1 lb');
  assert.equal(value('tipoVenta'), 'G');
  assert.equal(value('precio'), '4.42477876');

  for (const [el, previous] of before) {
    assert.equal(el.value, previous, `${el.getAttribute('formcontrolname') ?? el.tagName} outside the pop-up changed.`);
  }
});

test('fillItem refuses to run when the pop-up is not open', { skip }, async () => {
  loadFixture('ccf');
  await assert.rejects(
    () => fillItem(PRODUCT, 'ccf'),
    (e: unknown) => e instanceof FillError && e.code === 'ITEM_MODAL_MISSING',
  );
});

test('decimals are compared by value, ignoring the mask thousands separator', () => {
  assert.equal(valueLanded('1,234.5', '1234.5'), true);
  assert.equal(valueLanded('4.42477876', '4.42477876'), true);
  assert.equal(valueLanded('4.42', '4.42477876'), false, 'a truncated price must be reported');
  assert.equal(valueLanded('1,234', '1234'), true);
});

test('fillItem keeps a quantity the user already typed', { skip }, async () => {
  loadPageWithModal();
  control('cantidad').value = '3';
  await fillItem(PRODUCT, 'ccf');
  assert.equal(control('cantidad').value, '3');
});

test('switching to a product without a code clears the previous code', { skip }, async () => {
  loadPageWithModal();
  await fillItem(PRODUCT, 'ccf');
  assert.equal(control('codigoProducto').value, 'CAF-01');

  const { code: _, ...withoutCode } = PRODUCT;
  const report = await fillItem({ ...withoutCode, id: 'otro', description: 'Azúcar' }, 'ccf');

  assert.equal(control('codigoProducto').value, '');
  assert.equal(control('producto').value, 'Azúcar');
  assert.deepEqual(report.skipped, [{ key: 'code', reason: 'EMPTY_VALUE' }], 'cleared, not counted as filled');
});

test('fillItem refuses an invalid stored product and touches nothing', { skip }, async () => {
  loadPageWithModal();

  await assert.rejects(
    () => fillItem({ ...PRODUCT, description: ' ', price: -1 }, 'ccf'),
    (e: unknown) => e instanceof FillError && e.code === 'INVALID_PRODUCT' && /precio/.test(e.message),
  );
  assert.equal(control('producto').value, '');
  assert.equal(control('precio').value, '');
});
