// SPDX-License-Identifier: MIT
//
// Prueba de humo: se carga el bundle construido en jsdom con un `chrome` falso.
// Caza lo que ninguna prueba unitaria ni el typecheck ven —un id mal escrito, un
// `namedItem` que devuelve `null`— y por eso depende de `dist/`: sin build, se salta.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const DIST = resolve(process.cwd(), 'dist');
const built = existsSync(resolve(DIST, 'popup.js')) && existsSync(resolve(DIST, 'popup.html'));
const skip = built ? false : 'Falta dist/. Corre `npm run build` antes.';

interface Harness {
  window: JSDOM['window'];
  document: Document;
  storage: Record<string, unknown>;
  errors: string[];
  /** Deja que se resuelvan las promesas pendientes del arranque. */
  settle(): Promise<void>;
}

async function mountPopup(options: { tabUrl?: string; pingOk?: boolean } = {}): Promise<Harness> {
  const { tabUrl = 'https://example.com/', pingOk = false } = options;

  const dom = new JSDOM(readFileSync(resolve(DIST, 'popup.html'), 'utf8'), {
    url: 'chrome-extension://test/popup.html',
    runScripts: 'outside-only',
  });

  const { window } = dom;

  // jsdom no descarga el <link>, así que la hoja se inyecta a mano. Sin esto,
  // `getComputedStyle` no ve las reglas de autor y no se puede comprobar si un
  // elemento con [hidden] se está mostrando de verdad.
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

  // El bundle se evalúa dentro de la ventana para que use sus globales.
  window.eval(readFileSync(resolve(DIST, 'popup.js'), 'utf8'));

  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => window.setTimeout(r, 0));
  };
  await settle();

  return { window, document: window.document, storage, errors, settle };
}

test('[hidden] gana a cualquier regla de autor que fije display', { skip }, async () => {
  const { document, window } = await mountPopup();

  // Regresión: `.menu-panel{display:flex}` y `.wide{display:block}` vencían por
  // especificidad al `[hidden]{display:none}` del navegador, así que el menú de
  // tres puntos y «Guardar cliente actual» se veían siempre, dijera lo que
  // dijera `el.hidden`.
  for (const el of document.querySelectorAll<HTMLElement>('[hidden]')) {
    assert.equal(
      window.getComputedStyle(el).display,
      'none',
      `#${el.id || el.className} tiene [hidden] pero se sigue mostrando: alguna regla de CSS le fija display.`,
    );
  }
});

test('el menú de tres puntos abre y cierra', { skip }, async () => {
  const { document, window, settle } = await mountPopup();

  const panel = document.getElementById('menu-panel')!;
  const boton = document.getElementById('btn-menu') as HTMLButtonElement;
  const visible = () => window.getComputedStyle(panel).display !== 'none';

  assert.equal(visible(), false, 'debe nacer cerrado');
  assert.equal(boton.getAttribute('aria-expanded'), 'false');

  boton.click();
  await settle();
  assert.equal(visible(), true, 'un clic debe abrirlo');
  assert.equal(boton.getAttribute('aria-expanded'), 'true');

  boton.click();
  await settle();
  assert.equal(visible(), false, 'otro clic debe cerrarlo');

  // Y un clic fuera también lo cierra.
  boton.click();
  await settle();
  document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await settle();
  assert.equal(visible(), false, 'un clic fuera debe cerrarlo');
});

test('el popup arranca sin lanzar y muestra el estado vacío', { skip }, async () => {
  const { document, errors } = await mountPopup();

  assert.deepEqual(errors, [], 'el arranque no debe lanzar');
  assert.equal(document.getElementById('vista-lista')!.hasAttribute('hidden'), false);
  assert.equal(document.getElementById('vacio')!.hasAttribute('hidden'), false, 'sin clientes, aviso visible');
});

test('fuera del portal avisa y esconde «Guardar cliente actual»', { skip }, async () => {
  const { document } = await mountPopup({ tabUrl: 'https://example.com/' });

  const aviso = document.getElementById('aviso')!;
  assert.equal(aviso.hasAttribute('hidden'), false);
  assert.match(aviso.textContent!, /admin\.factura\.gob\.sv/);
  assert.equal(document.getElementById('btn-capturar')!.hasAttribute('hidden'), true);
});

test('en un CCF muestra el badge y habilita la captura', { skip }, async () => {
  const { document } = await mountPopup({ tabUrl: 'https://admin.factura.gob.sv/ccf', pingOk: true });

  assert.equal(document.getElementById('aviso')!.hasAttribute('hidden'), true, 'sin aviso: la página sirve');
  assert.equal(document.getElementById('badge')!.textContent, 'CCF');
  assert.equal(document.getElementById('btn-capturar')!.hasAttribute('hidden'), false);
});

test('dar de alta un cliente lo guarda y lo pinta en la lista', { skip }, async () => {
  const { document, window, storage, settle, errors } = await mountPopup();

  (document.getElementById('btn-nuevo') as HTMLButtonElement).click();
  await settle();

  assert.equal(document.getElementById('vista-edicion')!.hasAttribute('hidden'), false, 'debe abrirse la edición');

  const form = document.getElementById('form-cliente') as HTMLFormElement;
  const set = (name: string, value: string) => {
    const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
    assert.ok(el, `el formulario no tiene el campo «${name}»`);
    el.value = value;
  };

  set('nombre', 'Ferretería La Esquina');
  set('docType', '36');
  set('docNumber', '0614-120185-102-3');
  set('nrc', '123456-7');
  set('correo', 'pagos@laesquina.sv');
  set('telefono', '2222-1234');

  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  assert.deepEqual(errors, [], 'guardar no debe lanzar');

  const guardados = (storage.db as { customers: Record<string, string>[] }).customers;
  assert.equal(guardados.length, 1);
  assert.equal(guardados[0]!.nombre, 'Ferretería La Esquina');
  assert.equal(guardados[0]!.docNumber, '06141201851023', 'debe guardarse canónico, sin guiones');
  assert.equal(guardados[0]!.nrc, '1234567');
  assert.equal(guardados[0]!.telefono, '22221234');

  assert.equal(document.getElementById('vista-lista')!.hasAttribute('hidden'), false, 'debe volver a la lista');
  assert.equal(document.querySelectorAll('#lista .item').length, 1);
  assert.match(document.querySelector('.item-nombre')!.textContent!, /Ferretería La Esquina/);
});

test('el formulario rechaza un alta sin nombre y no guarda nada', { skip }, async () => {
  const { document, window, storage, settle } = await mountPopup();

  (document.getElementById('btn-nuevo') as HTMLButtonElement).click();
  await settle();

  const form = document.getElementById('form-cliente') as HTMLFormElement;
  (form.elements.namedItem('docNumber') as HTMLInputElement).value = '06141201851023';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();

  assert.equal(document.getElementById('vista-edicion')!.hasAttribute('hidden'), false, 'debe quedarse en la edición');
  assert.match(form.querySelector('[data-error-for="nombre"]')!.textContent!, /obligatorio/);
  assert.equal(storage.db, undefined, 'no debe haberse escrito nada');
});

test('la búsqueda filtra la lista', { skip }, async () => {
  const { document, window, settle } = await mountPopup();

  // Sembrar directamente el almacenamiento y forzar un re-render vía búsqueda.
  const buscar = document.getElementById('buscar') as HTMLInputElement;

  for (const [nombre, doc] of [['Peña y Asociados', '06141201851023'], ['Otro Cliente', '012345678']] as const) {
    (document.getElementById('btn-nuevo') as HTMLButtonElement).click();
    await settle();
    const form = document.getElementById('form-cliente') as HTMLFormElement;
    (form.elements.namedItem('nombre') as HTMLInputElement).value = nombre;
    (form.elements.namedItem('docType') as HTMLSelectElement).value = doc.length === 9 ? '13' : '36';
    (form.elements.namedItem('docNumber') as HTMLInputElement).value = doc;
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  }

  assert.equal(document.querySelectorAll('#lista .item').length, 2);

  buscar.value = 'pena';
  buscar.dispatchEvent(new window.Event('input', { bubbles: true }));
  await settle();

  assert.equal(document.querySelectorAll('#lista .item').length, 1, 'la búsqueda debe ignorar acentos');
  assert.match(document.querySelector('.item-nombre')!.textContent!, /Peña/);
});
