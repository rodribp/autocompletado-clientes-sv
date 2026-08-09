// SPDX-License-Identifier: MIT
//
// Los `<select>` se cotejan **por `value`, nunca por texto**: las etiquetas del
// portal traen espacios sobrantes, y distintos en cada página.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, fixturesAvailable, loadFixture } from '../helpers/fixtures.ts';
import { q, receptorRoot } from '../../src/content/forms/detect.ts';
import { setSelect } from '../../src/content/dom.ts';

const skip = fixturesAvailable() ? false : SKIP_REASON;

test('los 15 departamentos vienen pre-renderizados con códigos de dos dígitos', { skip }, () => {
  for (const name of ['cf', 'ccf'] as const) {
    loadFixture(name);
    const root = receptorRoot(name)!;
    const select = q<HTMLSelectElement>(root, 'departamento')!;

    const codigos = [...select.options].map((o) => o.value.trim());
    assert.equal(codigos.length, 15, `${name}: se esperaban 15 departamentos.`);
    assert.deepEqual(codigos.slice(0, 3), ['00', '01', '02'], `${name}: códigos con cero a la izquierda.`);
  }
});

test('setSelect encuentra un departamento por su código en ambas páginas', { skip }, () => {
  for (const name of ['cf', 'ccf'] as const) {
    loadFixture(name);
    const root = receptorRoot(name)!;
    const select = q<HTMLSelectElement>(root, 'departamento')!;

    assert.equal(setSelect(select, '06'), true, `${name}: no se pudo seleccionar San Salvador.`);
    assert.equal(select.value, '06');
  }
});

test('las etiquetas NO son fiables: CCF añade espacios que CF no tiene', { skip }, () => {
  loadFixture('cf');
  const cfText = [...q<HTMLSelectElement>(receptorRoot('cf')!, 'departamento')!.options]
    .find((o) => o.value.trim() === '01')!.textContent!;

  loadFixture('ccf');
  const ccfText = [...q<HTMLSelectElement>(receptorRoot('ccf')!, 'departamento')!.options]
    .find((o) => o.value.trim() === '01')!.textContent!;

  assert.notEqual(
    cfText,
    ccfText,
    'Si las etiquetas se igualaron, sigue igualmente prohibido cotejar por texto: los códigos son la fuente oficial.',
  );
  assert.equal(cfText.trim(), ccfText.trim(), 'Al recortar, deberían coincidir.');
});

test('CF llega con municipio y distrito vacíos: la cascada no ha corrido', { skip }, () => {
  loadFixture('cf');
  const root = receptorRoot('cf')!;

  for (const control of ['municipio', 'distrito']) {
    const select = q<HTMLSelectElement>(root, control)!;
    assert.equal(select.options.length, 0, `${control} debería estar vacío hasta que Angular lo pueble.`);
    assert.equal(setSelect(select, '20'), false, 'setSelect debe informar que la opción no existe todavía.');
  }
});

test('CCF fue capturado con la cascada ya poblada', { skip }, () => {
  loadFixture('ccf');
  const root = receptorRoot('ccf')!;

  const municipios = [...q<HTMLSelectElement>(root, 'municipio')!.options].map((o) => o.value.trim());
  assert.ok(municipios.includes('23'), 'Se esperaba San Salvador Centro (23) en el snapshot.');

  const distritos = [...q<HTMLSelectElement>(root, 'distrito')!.options];
  assert.ok(distritos.length > 0);
  // Los textos de distrito traen espacio al principio *y* al final.
  assert.notEqual(distritos[0]!.textContent, distritos[0]!.textContent!.trim());
});
