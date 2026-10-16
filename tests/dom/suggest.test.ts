// The suggestion list in the portal's item pop-up, driven against the real pop-up snapshot.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, itemFixtureAvailable, loadFixture, readFixture } from '../helpers/fixtures.ts';
import { installSuggestions } from '../../src/content/suggest.ts';
import { searchProducts } from '../../src/common/storage.ts';
import type { Product } from '../../src/common/types.ts';

const skip = itemFixtureAvailable() ? false : SKIP_REASON;

const base = { itemType: '1', unit: '59', saleType: 'G', createdAt: 0, updatedAt: 0 } as const;
const PRODUCTS: Product[] = [
  { ...base, id: 'a', description: 'Café molido', code: 'CAF-01', price: 5 },
  { ...base, id: 'b', description: 'Azúcar', price: 2, saleType: 'E' },
];

type Reply = (response: unknown) => void;

// `deferred`: hold the answers so a test can deliver them out of order.
function stubBackground(deferred = false): Array<() => void> {
  const pending: Array<() => void> = [];
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(message: { payload: { q: string; limit?: number } }, reply: Reply) {
        const answer = () => reply({ ok: true, data: searchProducts(PRODUCTS, message.payload.q) });
        if (deferred) pending.push(answer);
        else answer();
      },
    },
  };
  return pending;
}

function setup(): { field(name: string): HTMLInputElement } {
  loadFixture('ccf');
  const container = document.createElement('modal-container');
  container.innerHTML = readFixture('cf-item');
  document.body.append(container);
  installSuggestions(document);
  return {
    field: (name) => document.querySelector<HTMLInputElement>(`nuevo-item-doc [formcontrolname="${name}"]`)!,
  };
}

async function type(el: HTMLInputElement, value: string): Promise<void> {
  el.focus();
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function key(el: HTMLElement, name: string): void {
  el.dispatchEvent(new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

const options = () => [...document.querySelectorAll('#acsv-suggestions [role="option"]')];

test('typing in Producto suggests matching products', { skip }, async () => {
  stubBackground();
  const { field } = setup();
  const producto = field('producto');

  await type(producto, 'cafe');

  assert.equal(options().length, 1);
  assert.match(options()[0]!.textContent!, /Café molido.*CAF-01 · \$5\.00/);
  assert.equal(producto.getAttribute('aria-expanded'), 'true');
  assert.equal(producto.getAttribute('aria-controls'), 'acsv-suggestions');
});

test('arrow down + Enter fills the pop-up', { skip }, async () => {
  stubBackground();
  const { field } = setup();
  const producto = field('producto');

  await type(producto, 'azu');
  key(producto, 'ArrowDown');
  assert.equal(producto.getAttribute('aria-activedescendant'), 'acsv-suggestions-0');
  key(producto, 'Enter');
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));

  assert.equal(producto.value, 'Azúcar');
  assert.equal(field('precio').value, '2');
  assert.equal(field('tipoVenta').value, 'E');
  assert.equal(document.getElementById('acsv-suggestions'), null, 'the list closes after picking');
});

test('Esc closes the list without reaching the portal', { skip }, async () => {
  stubBackground();
  const { field } = setup();
  const producto = field('producto');
  let portalSawEsc = false;
  window.addEventListener('keydown', () => (portalSawEsc = true));

  await type(producto, 'caf');
  key(producto, 'Escape');

  assert.equal(document.getElementById('acsv-suggestions'), null);
  assert.equal(portalSawEsc, false, 'ngx-bootstrap would close the whole pop-up');
});

test('typing in Código suggests too, and Receptor fields never do', { skip }, async () => {
  stubBackground();
  const { field } = setup();

  await type(field('codigoProducto'), 'CAF');
  assert.equal(options().length, 1);

  const receptor = document.querySelector<HTMLInputElement>('app-common-receptor [formcontrolname="nombre"]')!;
  await type(receptor, 'caf');
  assert.equal(document.getElementById('acsv-suggestions'), null);
});

test('a late answer does not replace a newer one', { skip }, async () => {
  const pending = stubBackground(true);
  const { field } = setup();
  const producto = field('producto');

  await type(producto, 'a'); // matches both
  await type(producto, 'azu'); // matches one
  pending.at(-1)!();
  pending.at(-2)!();
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));

  assert.equal(options().length, 1);
  assert.match(options()[0]!.textContent!, /Azúcar/);
});
