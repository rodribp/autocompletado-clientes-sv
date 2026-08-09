// SPDX-License-Identifier: MIT

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actividadLabel,
  canonDocNumber,
  foldForSearch,
  formatDocNumber,
  formatNrc,
  formatTelefono,
  parseActividadLabel,
  parseDigits,
} from '../../src/common/normalize.ts';

test('parseDigits deja solo dígitos', () => {
  assert.equal(parseDigits('0614-120185-102-3'), '06141201851023');
  assert.equal(parseDigits(''), '');
  assert.equal(parseDigits(null), '');
});

test('canonDocNumber respeta el tipo: numérico para NIT/DUI, alfanumérico para el resto', () => {
  assert.equal(canonDocNumber('36', '0614-120185-102-3'), '06141201851023');
  assert.equal(canonDocNumber('13', '01234567-8'), '012345678');
  assert.equal(canonDocNumber('03', ' a1234567 '), 'A1234567');
  assert.equal(canonDocNumber('02', 'res-99'), 'RES-99');
});

test('el formato es de ida y vuelta con parseDigits', () => {
  for (const [tipo, canon] of [['36', '06141201851023'], ['13', '012345678']] as const) {
    const bonito = formatDocNumber(tipo, canon);
    assert.ok(bonito.includes('-'), `${tipo} debería mostrarse con guiones`);
    assert.equal(parseDigits(bonito), canon, 'formatear y volver a canonizar debe dar lo mismo');
  }
});

test('NRC y teléfono se muestran como los pinta la máscara del portal', () => {
  assert.equal(formatNrc('1234567'), '123456-7');
  assert.equal(formatTelefono('22221234'), '2222-1234');
  assert.equal(formatTelefono('222'), '222', 'lo incompleto se deja tal cual');
});

test('foldForSearch ignora acentos y mayúsculas', () => {
  assert.equal(foldForSearch('Peña Móvil'), 'pena movil');
  assert.equal(foldForSearch('PEÑA'), foldForSearch('peña'));
});

test('la etiqueta de actividad va y vuelve', () => {
  const actividad = { codigo: '71102', descripcion: 'Servicios de ingeniería' };
  const label = actividadLabel(actividad);

  assert.equal(label, '71102 - Servicios de ingeniería');
  assert.deepEqual(parseActividadLabel(label), actividad);
  assert.deepEqual(parseActividadLabel('  71102  -  Servicios de ingeniería  '), actividad);
  assert.equal(parseActividadLabel('sin separador'), null);
});

test('una descripción con guiones no se parte de más', () => {
  assert.deepEqual(parseActividadLabel('47190 - Venta al por menor - otros'), {
    codigo: '47190',
    descripcion: 'Venta al por menor - otros',
  });
});
