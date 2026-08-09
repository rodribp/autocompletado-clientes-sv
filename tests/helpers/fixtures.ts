// SPDX-License-Identifier: MIT
//
// Carga de los snapshots del portal en jsdom. La ruta sale de `SNAPSHOTS_DIR`
// o, por defecto, de `fixtures/`; cuando faltan, las pruebas se saltan.
//
// Aquí Angular no corre, así que estas pruebas validan selectores y recorrido
// del DOM, no el ciclo de eventos. Además, al re-parsear `ccf.html` se descarta
// el `<form>` anidado en `app-common-receptor`: nunca anclar nada ahí.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

// Desde cwd y no desde `import.meta.url`: los tests se compilan a `.tmp/`, así
// que una ruta relativa al archivo apuntaría ahí dentro.
const FIXTURE_DIR = resolve(process.cwd(), process.env.SNAPSHOTS_DIR ?? 'fixtures');

export type FixtureName = 'cf' | 'ccf';

export function fixturePath(name: FixtureName): string {
  return resolve(FIXTURE_DIR, `${name}.html`);
}

export function fixturesAvailable(): boolean {
  return existsSync(fixturePath('cf')) && existsSync(fixturePath('ccf'));
}

export const SKIP_REASON =
  'Faltan los snapshots del formulario (no se versionan). Ver tests/README.md.';

/** Monta un snapshot y publica los globales que espera el content script. */
export function loadFixture(name: FixtureName): JSDOM {
  const dom = new JSDOM(readFileSync(fixturePath(name), 'utf8'), { url: `https://admin.factura.gob.sv/${name}` });

  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.MutationObserver = dom.window.MutationObserver;
  g.Event = dom.window.Event;
  g.InputEvent = dom.window.InputEvent;
  g.MouseEvent = dom.window.MouseEvent;
  g.KeyboardEvent = dom.window.KeyboardEvent;
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  g.HTMLSelectElement = dom.window.HTMLSelectElement;

  return dom;
}
