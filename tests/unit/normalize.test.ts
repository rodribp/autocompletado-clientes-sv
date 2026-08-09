import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityLabel,
  canonDocNumber,
  foldForSearch,
  formatDocNumber,
  formatNrc,
  formatPhone,
  parseActivityLabel,
  parseDigits,
} from '../../src/common/normalize.ts';

test('parseDigits keeps only digits', () => {
  assert.equal(parseDigits('0614-120185-102-3'), '06141201851023');
  assert.equal(parseDigits(''), '');
  assert.equal(parseDigits(null), '');
});

test('canonDocNumber respects the type: numeric for NIT/DUI, alphanumeric otherwise', () => {
  assert.equal(canonDocNumber('36', '0614-120185-102-3'), '06141201851023');
  assert.equal(canonDocNumber('13', '01234567-8'), '012345678');
  assert.equal(canonDocNumber('03', ' a1234567 '), 'A1234567');
  assert.equal(canonDocNumber('02', 'res-99'), 'RES-99');
});

test('formatting round-trips through parseDigits', () => {
  for (const [docType, canon] of [['36', '06141201851023'], ['13', '012345678']] as const) {
    const pretty = formatDocNumber(docType, canon);
    assert.ok(pretty.includes('-'), `${docType} should be displayed with dashes`);
    assert.equal(parseDigits(pretty), canon, 'formatting then canonicalizing should give the same value');
  }
});

test('NRC and phone are displayed like the portal mask renders them', () => {
  assert.equal(formatNrc('1234567'), '123456-7');
  assert.equal(formatPhone('22221234'), '2222-1234');
  assert.equal(formatPhone('222'), '222', 'incomplete values are left as-is');
});

test('foldForSearch ignores accents and case', () => {
  assert.equal(foldForSearch('Peña Móvil'), 'pena movil');
  assert.equal(foldForSearch('PEÑA'), foldForSearch('peña'));
});

test('activity label round-trips', () => {
  const activity = { code: '71102', description: 'Servicios de ingeniería' };
  const label = activityLabel(activity);

  assert.equal(label, '71102 - Servicios de ingeniería');
  assert.deepEqual(parseActivityLabel(label), activity);
  assert.deepEqual(parseActivityLabel('  71102  -  Servicios de ingeniería  '), activity);
  assert.equal(parseActivityLabel('sin separador'), null);
});

test('a description containing dashes is not over-split', () => {
  assert.deepEqual(parseActivityLabel('47190 - Venta al por menor - otros'), {
    code: '47190',
    description: 'Venta al por menor - otros',
  });
});
