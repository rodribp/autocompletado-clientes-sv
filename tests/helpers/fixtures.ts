// No Angular: these check selectors, not events. Re-parsing `ccf.html` drops the
// `<form>` nested in `app-common-receptor`, so never anchor anything there.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

// Resolve from cwd: tests compile to `.tmp/`, where `import.meta.url` would point.
const FIXTURE_DIR = resolve(process.cwd(), process.env.SNAPSHOTS_DIR ?? 'fixtures');

export type FixtureName = 'cf' | 'ccf' | 'cf-item';

export function fixturePath(name: FixtureName): string {
  return resolve(FIXTURE_DIR, `${name}.html`);
}

export function fixturesAvailable(): boolean {
  return existsSync(fixturePath('cf')) && existsSync(fixturePath('ccf'));
}

// Only the open "Ítem DTE" pop-up, identical in CF and CCF.
export function itemFixtureAvailable(): boolean {
  return fixturesAvailable() && existsSync(fixturePath('cf-item'));
}

export function readFixture(name: FixtureName): string {
  return readFileSync(fixturePath(name), 'utf8');
}

export const SKIP_REASON =
  'Form snapshots are missing (not versioned). See tests/README.md.';

export function loadFixture(name: FixtureName): JSDOM {
  const dom = new JSDOM(readFixture(name), { url: `https://admin.factura.gob.sv/${name}` });

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
