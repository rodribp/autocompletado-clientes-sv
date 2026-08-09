// Synthetic double: the `<ng-select>` panel only exists while open, and snapshots were saved closed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setNgSelect } from '../../src/content/dom.ts';

interface HarnessOptions {
  appendTo?: 'host' | 'body';
  delayMs?: number;
  catalog?: string[];
  disabled?: boolean;
}

const DEFAULT_CATALOG = [
  '71102 - Servicios de ingeniería',
  '71100 - Actividades de arquitectura',
  '47190 - Venta al por menor',
];

function buildHarness(options: HarnessOptions = {}): { host: HTMLElement; dom: JSDOM } {
  const { appendTo = 'host', delayMs = 50, catalog = DEFAULT_CATALOG, disabled = false } = options;

  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://admin.factura.gob.sv/ccf' });
  const { window } = dom;
  const { document } = window;

  const g = globalThis as unknown as Record<string, unknown>;
  g.window = window;
  g.document = document;
  g.MutationObserver = window.MutationObserver;
  g.Event = window.Event;
  g.InputEvent = window.InputEvent;
  g.MouseEvent = window.MouseEvent;
  g.KeyboardEvent = window.KeyboardEvent;
  g.HTMLInputElement = window.HTMLInputElement;
  g.HTMLTextAreaElement = window.HTMLTextAreaElement;

  document.body.innerHTML = `
    <ng-select formcontrolname="actividadEconomica" class="ng-select ng-select-single${disabled ? ' ng-select-disabled' : ''}">
      <div class="ng-select-container">
        <div class="ng-value-container">
          <div class="ng-placeholder"></div>
          <div class="ng-input"><input role="combobox" type="text" autocomplete="a1e749b07f10"></div>
        </div>
      </div>
    </ng-select>`;

  const host = document.querySelector('ng-select') as unknown as HTMLElement;
  const search = host.querySelector('input[role="combobox"]') as HTMLInputElement;
  const container = host.querySelector('.ng-select-container') as HTMLElement;

  let open = false;
  container.addEventListener('mousedown', () => {
    open = true;
  });

  search.addEventListener('input', () => {
    if (!open || disabled) return;
    const term = search.value.trim().toLowerCase();

    setTimeout(() => {
      (host.ownerDocument.querySelector('ng-dropdown-panel') ?? { remove() {} }).remove();

      const panel = document.createElement('ng-dropdown-panel');
      for (const label of catalog.filter((c) => c.toLowerCase().includes(term))) {
        const option = document.createElement('div');
        option.className = 'ng-option';
        option.textContent = label;
        option.addEventListener('mousedown', () => {
          const value = document.createElement('span');
          value.className = 'ng-value-label';
          value.textContent = label;
          host.querySelector('.ng-placeholder')?.replaceWith(value);
          panel.remove();
        });
        panel.append(option);
      }
      (appendTo === 'body' ? document.body : host).append(panel);
    }, delayMs);
  });

  return { host, dom };
}

test('picks the option whose code matches', async () => {
  const { host } = buildHarness();

  const outcome = await setNgSelect(host, '71102', '71102 - Servicios de ingeniería');

  assert.equal(outcome, 'ok');
  assert.equal(host.querySelector('.ng-value-label')?.textContent, '71102 - Servicios de ingeniería');
});

test('works with the panel attached to <body> (appendTo)', async () => {
  const { host } = buildHarness({ appendTo: 'body' });

  assert.equal(await setNgSelect(host, '71102', '71102 - Servicios de ingeniería'), 'ok');
});

test('tolerates a slow option list, as if loaded over the network', async () => {
  const { host } = buildHarness({ delayMs: 900 });

  assert.equal(await setNgSelect(host, '47190', '47190 - Venta al por menor'), 'ok');
});

test('does not confuse 71102 with 71100 even when the filter leaves both', async () => {
  const { host } = buildHarness();

  await setNgSelect(host, '7110', '71100 - Actividades de arquitectura');

  assert.equal(
    host.querySelector('.ng-value-label')?.textContent,
    '71100 - Actividades de arquitectura',
    'with two candidates it must decide by exact label',
  );
});

test('reports notFound when the code is not in the catalog', async () => {
  const { host, dom } = buildHarness();

  const outcome = await setNgSelect(host, '99999', '99999 - Inexistente');

  assert.equal(outcome, 'notFound');
  assert.equal(
    dom.window.document.querySelector('ng-dropdown-panel')?.children.length ?? 0,
    0,
    'the panel must not stay open covering the following fields',
  );
});

test('reports disabled without touching anything', async () => {
  const { host } = buildHarness({ disabled: true });

  assert.equal(await setNgSelect(host, '71102', '71102 - Servicios de ingeniería'), 'disabled');
});
