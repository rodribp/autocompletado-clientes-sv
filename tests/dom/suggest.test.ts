// The suggestion list in the portal's item pop-up, driven against the real pop-up snapshot.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, itemFixtureAvailable, loadFixture, readFixture } from '../helpers/fixtures.ts';
import { installSuggestions } from '../../src/content/suggest.ts';
import { searchCustomers, searchProducts } from '../../src/common/storage.ts';
import { emptyAddress, type Customer, type Product } from '../../src/common/types.ts';

const skip = itemFixtureAvailable() ? false : SKIP_REASON;

const base = { itemType: '1', unit: '59', saleType: 'G', createdAt: 0, updatedAt: 0 } as const;
const PRODUCTS: Product[] = [
  { ...base, id: 'a', description: 'Café molido', code: 'CAF-01', price: 5 },
  { ...base, id: 'b', description: 'Azúcar', price: 2, saleType: 'E' },
];

const person = { docType: '36', address: emptyAddress(), createdAt: 0, updatedAt: 0 } as const;
const CUSTOMERS: Customer[] = [
  { ...person, id: 'c1', name: 'Ferretería La Esquina', docNumber: '06141201851023', nrc: '1234567', email: 'pagos@esquina.sv' },
  { ...person, id: 'c2', name: 'Panadería Sin Correo', docNumber: '06140101900011', nrc: '7654321' },
  { ...person, id: 'c3', name: 'Turista Sin NIT', docType: '03', docNumber: 'AB12345' },
];

type Reply = (response: unknown) => void;

// `deferred`: hold the answers so a test can deliver them out of order.
function stubBackground(deferred = false): Array<() => void> {
  const pending: Array<() => void> = [];
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(message: { kind: string; payload: { q: string; limit?: number } }, reply: Reply) {
        const data =
          message.kind === 'QUERY_PRODUCTS'
            ? searchProducts(PRODUCTS, message.payload.q)
            : message.kind === 'QUERY_CUSTOMERS'
              ? searchCustomers(CUSTOMERS, message.payload.q)
              : {};
        const answer = () => reply({ ok: true, data });
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

test('typing in Código suggests too', { skip }, async () => {
  stubBackground();
  const { field } = setup();

  await type(field('codigoProducto'), 'CAF');
  assert.equal(options().length, 1);
  assert.match(document.getElementById('acsv-suggestions')!.getAttribute('aria-label')!, /Productos/);
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

// --- Customers in the Receptor ---

const receptor = (name: string) =>
  document.querySelector<HTMLInputElement>(`app-common-receptor [formcontrolname="${name}"]`)!;
const emisor = (name: string) =>
  document.querySelector<HTMLInputElement>(`app-common-emisor [formcontrolname="${name}"]`)!;

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

test('CCF Receptor suggests customers by name, NIT or NRC', { skip }, async () => {
  stubBackground();
  setup();

  await type(receptor('nombre'), 'ferreteria');
  assert.equal(options().length, 1);
  assert.match(options()[0]!.textContent!, /Ferretería La Esquina.*NIT 0614-120185-102-3 · NRC 123456-7/);
  assert.match(document.getElementById('acsv-suggestions')!.getAttribute('aria-label')!, /Clientes/);

  await type(receptor('nit'), '0614-0101');
  assert.match(options()[0]!.textContent!, /Panadería/, 'NIT matches by digits, dashes ignored');

  await type(receptor('nrc'), '765432');
  assert.match(options()[0]!.textContent!, /Panadería/);
});

test('the Emisor never suggests customers, even with the same field names', { skip }, async () => {
  stubBackground();
  setup();

  for (const name of ['nombre', 'nrc', 'nit']) {
    const el = emisor(name);
    if (!el) continue;
    await type(el, 'ferreteria');
    assert.equal(document.getElementById('acsv-suggestions'), null, `Emisor "${name}" opened suggestions`);
  }
});

test('picking a customer fills the Receptor and clears what the previous one left', { skip }, async () => {
  stubBackground();
  setup();
  const emisorEmail = emisor('correo').value;

  await type(receptor('nombre'), 'ferreteria');
  key(receptor('nombre'), 'ArrowDown');
  key(receptor('nombre'), 'Enter');
  await settle();
  assert.equal(receptor('nombre').value, 'Ferretería La Esquina');
  assert.equal(receptor('nit').value, '06141201851023');
  assert.equal(receptor('correo').value, 'pagos@esquina.sv');

  await type(receptor('nombre'), 'panaderia');
  key(receptor('nombre'), 'ArrowDown');
  key(receptor('nombre'), 'Enter');
  await settle();
  assert.equal(receptor('nombre').value, 'Panadería Sin Correo');
  assert.equal(receptor('correo').value, '', 'the previous customer\'s email must not stay');
  assert.equal(emisor('correo').value, emisorEmail, 'the Emisor is never touched');
});

test('in CCF a customer without NIT or DUI is marked and picking it clears the NIT', { skip }, async () => {
  stubBackground();
  setup();
  receptor('nit').value = '06141201851023';

  await type(receptor('nombre'), 'turista');
  assert.match(options()[0]!.textContent!, /No apto para CCF/);
  key(receptor('nombre'), 'ArrowDown');
  key(receptor('nombre'), 'Enter');
  await settle();

  assert.equal(receptor('nit').value, '', 'a NIT from someone else would be worse than none');
  assert.equal(document.querySelector('.acsv-status')?.textContent ?? null, null, 'already flagged on the option, no extra alert');
});

test('CF: the document number field suggests, ng-select\'s own search box does not', { skip }, async () => {
  stubBackground();
  loadFixture('cf');
  installSuggestions(document);
  const root = document.querySelector('app-facturador-cf tab[heading="Receptor"]')!;

  // Angular renders the number field only after a document type is chosen.
  const docNumber = document.createElement('input');
  docNumber.setAttribute('formcontrolname', 'numDocumento');
  root.querySelector('[formcontrolname="tipoDocumento"]')!.closest('div.form-group.row')!.append(docNumber);
  await type(docNumber, '0614-1201');
  assert.match(options()[0]!.textContent!, /Ferretería/);

  const ngSearch = root.querySelector<HTMLInputElement>('ng-select input');
  if (ngSearch) {
    await type(ngSearch, 'ferreteria');
    assert.equal(document.getElementById('acsv-suggestions'), null);
  }
});
