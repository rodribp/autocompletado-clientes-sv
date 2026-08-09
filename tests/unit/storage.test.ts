import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeStub } from '../helpers/chrome-stub.ts';

const store = installChromeStub();

const {
  applyImport,
  deleteCustomer,
  exportJson,
  importJson,
  listCustomers,
  migrate,
  planImport,
  readDb,
  saveCustomer,
  searchCustomers,
} = await import('../../src/common/storage.ts');
const { emptyAddress } = await import('../../src/common/types.ts');

function draft(name: string, docNumber = '06141201851023') {
  return { name, docType: '36' as const, docNumber, address: emptyAddress() };
}

beforeEach(() => store.reset());

test('saving a customer actually persists it', async () => {
  // Regression: addCustomerInfo pushed onto a local array and never called set.
  await saveCustomer(draft('Ferretería La Esquina'));

  const fromDisk = await listCustomers();
  assert.equal(fromDisk.length, 1);
  assert.equal(fromDisk[0]!.name, 'Ferretería La Esquina');
  assert.ok(fromDisk[0]!.id, 'an id should be assigned');
});

test('migrate tolerates the "{}" left by the old JSON.parse(x ?? "{}")', () => {
  assert.deepEqual(migrate({}).customers, []);
  assert.deepEqual(migrate(undefined).customers, []);
  assert.deepEqual(migrate(null).customers, []);
  assert.deepEqual(migrate('basura').customers, []);
});

test('migrate accepts the legacy bare array', () => {
  const db = migrate([{ name: 'X', docType: '36', docNumber: '1' }]);
  assert.equal(db.customers.length, 1);
  assert.ok(db.customers[0]!.id, 'an id is assigned on the fly');
  assert.deepEqual(db.customers[0]!.address, emptyAddress(), 'the missing address is filled in');
});

test('migrate drops records that are not customer-shaped', () => {
  const db = migrate({ schemaVersion: 1, customers: [{ name: 'ok', docType: '36', docNumber: '1' }, { basura: true }] });
  assert.equal(db.customers.length, 1);
});

test('saving twice with the same id updates instead of duplicating', async () => {
  const created = await saveCustomer(draft('Original'));
  const updated = await saveCustomer({ ...draft('Corregido'), id: created.id });

  assert.equal(updated.id, created.id);
  assert.equal(updated.createdAt, created.createdAt, 'the creation date does not change');
  assert.equal((await listCustomers()).length, 1);
});

test('concurrent writes do not clobber each other', async () => {
  // Without the mutex, both would read an empty db and the second would drop the first.
  await Promise.all([saveCustomer(draft('Uno')), saveCustomer(draft('Dos')), saveCustomer(draft('Tres'))]);

  const names = (await listCustomers()).map((c) => c.name).sort();
  assert.deepEqual(names, ['Dos', 'Tres', 'Uno']);
});

test('deleting removes only the chosen one', async () => {
  const first = await saveCustomer(draft('Uno'));
  await saveCustomer(draft('Dos'));

  await deleteCustomer(first.id);
  const remaining = await listCustomers();

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]!.name, 'Dos');
});

test('the list is sorted using Spanish collation rules', async () => {
  for (const name of ['Zapatería', 'Ávila', 'ñandú', 'Banco']) await saveCustomer(draft(name));

  assert.deepEqual(
    (await listCustomers()).map((c) => c.name),
    ['Ávila', 'Banco', 'ñandú', 'Zapatería'],
  );
});

test('search ignores accents and matches digits with or without dashes', async () => {
  const all = [
    { ...draft('Peña y Asociados', '06141201851023'), id: 'a', createdAt: 0, updatedAt: 0, nrc: '1234567' },
    { ...draft('Otro Cliente', '012345678'), id: 'b', createdAt: 0, updatedAt: 0 },
  ];

  assert.equal(searchCustomers(all, 'pena')[0]?.id, 'a');
  assert.equal(searchCustomers(all, 'PEÑA')[0]?.id, 'a');
  assert.equal(searchCustomers(all, '0614-1201')[0]?.id, 'a', 'dashes in the query are ignored');
  assert.equal(searchCustomers(all, '123456')[0]?.id, 'a', 'also searches by NRC');
  assert.equal(searchCustomers(all, '').length, 2, 'no query, no filtering');
  assert.equal(searchCustomers(all, 'zzz').length, 0);
});

test('export then import keeps the customers', async () => {
  await saveCustomer(draft('Uno'));
  await saveCustomer(draft('Dos'));
  const backup = await exportJson();

  store.reset();
  assert.equal((await listCustomers()).length, 0);

  const report = await importJson(backup, 'merge');
  assert.equal(report.imported, 2);
  assert.equal(report.skipped, 0);
  assert.equal((await listCustomers()).length, 2);
});

test('import skips corrupt records without aborting the rest', async () => {
  const content = JSON.stringify({
    customers: [
      { id: 'x', name: 'Bueno', docType: '36', docNumber: '1', address: emptyAddress() },
      { id: 'y', falta: 'todo' },
    ],
  });

  const report = await importJson(content, 'merge');

  assert.equal(report.imported, 1);
  assert.equal(report.skipped, 1);
  assert.equal((await listCustomers()).length, 1);
});

test('importing a file that is not a backup gives a readable error', async () => {
  await assert.rejects(() => importJson('esto no es json', 'merge'), /JSON válido/);
  await assert.rejects(() => importJson('{"otra":"cosa"}', 'merge'), /respaldo de clientes/);
});

test('planImport splits additions from overwrites without touching disk', async () => {
  const existing = await saveCustomer(draft('Nombre Viejo'));
  const content = JSON.stringify({
    customers: [
      { ...existing, name: 'Nombre Nuevo' },
      { id: 'otro', name: 'Recién Llegado', docType: '36', docNumber: '2', address: emptyAddress() },
      { id: 'roto', falta: 'todo' },
    ],
  });

  const plan = await planImport(content);

  assert.equal(plan.added.length, 1);
  assert.equal(plan.added[0]!.name, 'Recién Llegado');
  assert.equal(plan.collisions.length, 1);
  assert.equal(plan.collisions[0]!.existing.name, 'Nombre Viejo', 'should include the one that would be overwritten');
  assert.equal(plan.collisions[0]!.incoming.name, 'Nombre Nuevo');
  assert.equal(plan.skipped, 1);
  assert.equal(plan.existingTotal, 1);

  const onDisk = await listCustomers();
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0]!.name, 'Nombre Viejo', 'planImport should not have saved anything');
});

test('applyImport writes what planImport promised', async () => {
  await saveCustomer(draft('Nombre Viejo'));
  const content = JSON.stringify({
    customers: [
      { id: 'otro', name: 'Recién Llegado', docType: '36', docNumber: '2', address: emptyAddress() },
    ],
  });

  const plan = await planImport(content);
  const report = await applyImport(plan.valid, plan.skipped, 'merge');

  assert.equal(report.imported, 1);
  assert.equal(report.updated, 0);
  assert.equal((await listCustomers()).length, 2, 'merge keeps the existing customer');
});

test('importing in replace mode discards previous data', async () => {
  await saveCustomer(draft('Viejo'));
  const content = JSON.stringify({
    customers: [{ id: 'z', name: 'Nuevo', docType: '36', docNumber: '1', address: emptyAddress() }],
  });

  await importJson(content, 'replace');
  const remaining = await listCustomers();

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]!.name, 'Nuevo');
});

test('readDb always returns an array of customers', async () => {
  const db = await readDb();
  assert.ok(Array.isArray(db.customers), 'the original bug returned an object here');
});
