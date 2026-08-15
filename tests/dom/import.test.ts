// SPDX-License-Identifier: MIT
//
// La página de importación existe porque el popup se cierra al abrir el
// selector de archivos. Esta prueba cubre lo que aquello rompía: que elegir un
// archivo llegue a `change`, que la vista previa cuente bien, y —lo que el
// popup no hacía— que no se escriba nada hasta confirmar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const DIST = resolve(process.cwd(), 'dist');
const built = existsSync(resolve(DIST, 'import.js')) && existsSync(resolve(DIST, 'import.html'));
const skip = built ? false : 'Falta dist/. Corre `npm run build` antes.';

const CLIENTE = {
  id: 'ya-existe',
  nombre: 'Nombre Viejo',
  docType: '36',
  docNumber: '06141201851023',
  direccion: { departamento: '', municipio: '', distrito: '', complemento: '' },
  createdAt: 1,
  updatedAt: 1,
};

interface Harness {
  window: JSDOM['window'];
  document: Document;
  storage: Record<string, unknown>;
  errors: string[];
  settle(): Promise<void>;
  /** Simula elegir un archivo en el diálogo del sistema. */
  choose(contenido: string): Promise<void>;
}

async function mountImport(guardados: unknown[] = []): Promise<Harness> {
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
  if (guardados.length > 0) storage.db = { schemaVersion: 1, customers: guardados };

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

  const choose = async (contenido: string) => {
    const input = window.document.getElementById('file') as HTMLInputElement;
    const file = new window.File([contenido], 'respaldo.json', { type: 'application/json' });
    // `files` es de solo lectura y jsdom no tiene diálogo: se sustituye a mano.
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  };

  return { window, document: window.document, storage, errors, settle, choose };
}

function respaldo(customers: unknown[]): string {
  return JSON.stringify({ formato: 'autocompletado-clientes-sv', schemaVersion: 1, customers });
}

test('la página arranca en el paso de elegir archivo', { skip }, async () => {
  const { document, errors } = await mountImport();

  assert.deepEqual(errors, [], 'el arranque no debe lanzar');
  assert.equal(document.getElementById('paso-elegir')!.hasAttribute('hidden'), false);
  assert.equal(document.getElementById('paso-previa')!.hasAttribute('hidden'), true);
  assert.equal(document.getElementById('paso-hecho')!.hasAttribute('hidden'), true);
});

test('elegir un archivo enseña la vista previa y no escribe nada', { skip }, async () => {
  const { document, storage, errors, choose } = await mountImport([CLIENTE]);

  await choose(
    respaldo([
      { ...CLIENTE, nombre: 'Nombre Nuevo' },
      { id: 'otro', nombre: 'Recién Llegado', docType: '36', docNumber: '9', direccion: CLIENTE.direccion },
      { id: 'roto', falta: 'todo' },
    ]),
  );

  assert.deepEqual(errors, [], 'leer el archivo no debe lanzar');
  assert.equal(document.getElementById('paso-previa')!.hasAttribute('hidden'), false, 'debe abrirse la previa');
  assert.equal(document.getElementById('n-nuevos')!.textContent, '1');
  assert.equal(document.getElementById('n-actualizados')!.textContent, '1');
  assert.equal(document.getElementById('n-omitidos')!.textContent, '1');
  assert.equal(document.getElementById('li-omitidos')!.hasAttribute('hidden'), false);

  // El nombre que se perdería se enseña tachado junto al que entra.
  const detalle = document.getElementById('detalle')!;
  assert.match(detalle.textContent!, /Recién Llegado/);
  assert.match(detalle.querySelector('.pisa')!.textContent!, /Nombre Viejo/);

  const guardados = (storage.db as { customers: { nombre: string }[] }).customers;
  assert.equal(guardados.length, 1);
  assert.equal(guardados[0]!.nombre, 'Nombre Viejo', 'la vista previa no debe haber escrito');
});

test('confirmar escribe y muestra el resultado', { skip }, async () => {
  const { document, storage, settle, choose } = await mountImport([CLIENTE]);

  await choose(
    respaldo([
      { ...CLIENTE, nombre: 'Nombre Nuevo' },
      { id: 'otro', nombre: 'Recién Llegado', docType: '36', docNumber: '9', direccion: CLIENTE.direccion },
    ]),
  );

  (document.getElementById('btn-confirmar') as HTMLButtonElement).click();
  await settle();

  assert.equal(document.getElementById('paso-hecho')!.hasAttribute('hidden'), false);
  assert.match(document.getElementById('reporte')!.textContent!, /Importados 1, actualizados 1/);

  const guardados = (storage.db as { customers: { nombre: string }[] }).customers;
  assert.equal(guardados.length, 2);
  assert.ok(
    guardados.some((c) => c.nombre === 'Nombre Nuevo'),
    'el repetido debe haberse sobrescrito',
  );
});

test('reemplazar avisa de cuántos clientes se perderían', { skip }, async () => {
  const { document, window, settle, choose } = await mountImport([
    CLIENTE,
    { ...CLIENTE, id: 'se-pierde', nombre: 'No Está En El Archivo' },
  ]);

  await choose(respaldo([{ ...CLIENTE, nombre: 'Nombre Nuevo' }]));

  const aviso = document.getElementById('aviso-replace')!;
  assert.equal(aviso.hasAttribute('hidden'), true, 'combinar no pierde nada, no debe avisar');

  const replace = document.querySelector('input[name="modo"][value="replace"]') as HTMLInputElement;
  replace.checked = true;
  replace.dispatchEvent(new window.Event('change', { bubbles: true }));
  await settle();

  assert.equal(aviso.hasAttribute('hidden'), false);
  assert.match(aviso.textContent!, /Se borrará 1 cliente|Se borrarán 1|borrará/);
});

test('un archivo que no es un respaldo se explica y no rompe la página', { skip }, async () => {
  const { document, storage, errors, choose } = await mountImport([CLIENTE]);

  await choose('esto no es json');

  assert.deepEqual(errors, [], 'un archivo malo no debe lanzar');
  const error = document.getElementById('error')!;
  assert.equal(error.hasAttribute('hidden'), false);
  assert.match(error.textContent!, /JSON válido/);
  assert.equal(document.getElementById('paso-previa')!.hasAttribute('hidden'), true, 'no debe avanzar');
  assert.equal((storage.db as { customers: unknown[] }).customers.length, 1, 'no debe tocar lo guardado');
});
