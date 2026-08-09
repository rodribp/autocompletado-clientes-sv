// SPDX-License-Identifier: MIT
//
// Incluye regresiones de los dos fallos de la implementación anterior: no
// persistir el alta, y devolver un objeto donde se esperaba un array.

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeStub } from '../helpers/chrome-stub.ts';

const store = installChromeStub();

const {
  deleteCustomer,
  exportJson,
  importJson,
  listCustomers,
  migrate,
  readDb,
  saveCustomer,
  searchCustomers,
} = await import('../../src/common/storage.ts');
const { emptyDireccion } = await import('../../src/common/types.ts');

function draft(nombre: string, docNumber = '06141201851023') {
  return { nombre, docType: '36' as const, docNumber, direccion: emptyDireccion() };
}

beforeEach(() => store.reset());

test('guardar un cliente lo persiste de verdad', async () => {
  // El bug original: addCustomerInfo hacía push sobre un array local y nunca
  // llamaba a set, así que el cliente desaparecía al cerrar el popup.
  await saveCustomer(draft('Ferretería La Esquina'));

  const desdeDisco = await listCustomers();
  assert.equal(desdeDisco.length, 1);
  assert.equal(desdeDisco[0]!.nombre, 'Ferretería La Esquina');
  assert.ok(desdeDisco[0]!.id, 'debe asignarse un id');
});

test('migrate tolera el "{}" que dejaba el JSON.parse(x ?? "{}") anterior', () => {
  assert.deepEqual(migrate({}).customers, []);
  assert.deepEqual(migrate(undefined).customers, []);
  assert.deepEqual(migrate(null).customers, []);
  assert.deepEqual(migrate('basura').customers, []);
});

test('migrate acepta el array pelado heredado', () => {
  const db = migrate([{ nombre: 'X', docType: '36', docNumber: '1' }]);
  assert.equal(db.customers.length, 1);
  assert.ok(db.customers[0]!.id, 'se le asigna id al vuelo');
  assert.deepEqual(db.customers[0]!.direccion, emptyDireccion(), 'se completa la dirección ausente');
});

test('migrate descarta registros sin forma de cliente', () => {
  const db = migrate({ schemaVersion: 1, customers: [{ nombre: 'ok', docType: '36', docNumber: '1' }, { basura: true }] });
  assert.equal(db.customers.length, 1);
});

test('guardar dos veces con el mismo id actualiza en vez de duplicar', async () => {
  const creado = await saveCustomer(draft('Original'));
  const actualizado = await saveCustomer({ ...draft('Corregido'), id: creado.id });

  assert.equal(actualizado.id, creado.id);
  assert.equal(actualizado.createdAt, creado.createdAt, 'la fecha de alta no cambia');
  assert.equal((await listCustomers()).length, 1);
});

test('escrituras concurrentes no se pisan', async () => {
  // Sin el mutex, ambas leerían la base vacía y la segunda perdería la primera.
  await Promise.all([saveCustomer(draft('Uno')), saveCustomer(draft('Dos')), saveCustomer(draft('Tres'))]);

  const nombres = (await listCustomers()).map((c) => c.nombre).sort();
  assert.deepEqual(nombres, ['Dos', 'Tres', 'Uno']);
});

test('borrar quita solo al elegido', async () => {
  const uno = await saveCustomer(draft('Uno'));
  await saveCustomer(draft('Dos'));

  await deleteCustomer(uno.id);
  const restantes = await listCustomers();

  assert.equal(restantes.length, 1);
  assert.equal(restantes[0]!.nombre, 'Dos');
});

test('la lista viene ordenada con las reglas del español', async () => {
  for (const nombre of ['Zapatería', 'Ávila', 'ñandú', 'Banco']) await saveCustomer(draft(nombre));

  assert.deepEqual(
    (await listCustomers()).map((c) => c.nombre),
    ['Ávila', 'Banco', 'ñandú', 'Zapatería'],
  );
});

test('la búsqueda ignora acentos y encuentra por dígitos con o sin guiones', async () => {
  const all = [
    { ...draft('Peña y Asociados', '06141201851023'), id: 'a', createdAt: 0, updatedAt: 0, nrc: '1234567' },
    { ...draft('Otro Cliente', '012345678'), id: 'b', createdAt: 0, updatedAt: 0 },
  ];

  assert.equal(searchCustomers(all, 'pena')[0]?.id, 'a');
  assert.equal(searchCustomers(all, 'PEÑA')[0]?.id, 'a');
  assert.equal(searchCustomers(all, '0614-1201')[0]?.id, 'a', 'los guiones del término se ignoran');
  assert.equal(searchCustomers(all, '123456')[0]?.id, 'a', 'también busca por NRC');
  assert.equal(searchCustomers(all, '').length, 2, 'sin término, no filtra');
  assert.equal(searchCustomers(all, 'zzz').length, 0);
});

test('exportar e importar conserva a los clientes', async () => {
  await saveCustomer(draft('Uno'));
  await saveCustomer(draft('Dos'));
  const respaldo = await exportJson();

  store.reset();
  assert.equal((await listCustomers()).length, 0);

  const report = await importJson(respaldo, 'merge');
  assert.equal(report.importados, 2);
  assert.equal(report.omitidos, 0);
  assert.equal((await listCustomers()).length, 2);
});

test('importar omite los registros corruptos sin abortar el resto', async () => {
  const contenido = JSON.stringify({
    customers: [
      { id: 'x', nombre: 'Bueno', docType: '36', docNumber: '1', direccion: emptyDireccion() },
      { id: 'y', falta: 'todo' },
    ],
  });

  const report = await importJson(contenido, 'merge');

  assert.equal(report.importados, 1);
  assert.equal(report.omitidos, 1);
  assert.equal((await listCustomers()).length, 1);
});

test('importar un archivo que no es un respaldo da un error legible', async () => {
  await assert.rejects(() => importJson('esto no es json', 'merge'), /JSON válido/);
  await assert.rejects(() => importJson('{"otra":"cosa"}', 'merge'), /respaldo de clientes/);
});

test('importar en modo replace descarta lo anterior', async () => {
  await saveCustomer(draft('Viejo'));
  const contenido = JSON.stringify({
    customers: [{ id: 'z', nombre: 'Nuevo', docType: '36', docNumber: '1', direccion: emptyDireccion() }],
  });

  await importJson(contenido, 'replace');
  const restantes = await listCustomers();

  assert.equal(restantes.length, 1);
  assert.equal(restantes[0]!.nombre, 'Nuevo');
});

test('readDb siempre devuelve un array de clientes', async () => {
  const db = await readDb();
  assert.ok(Array.isArray(db.customers), 'el bug original devolvía un objeto aquí');
});
