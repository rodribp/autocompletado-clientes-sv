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
  formatAmount,
  parsePrice,
  unitPriceFor,
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

test('unitPriceFor removes IVA only for a taxed item on a CCF', () => {
  assert.equal(unitPriceFor({ price: 11.3, saleType: 'G' }, 'ccf'), '10', 'float noise must not leak through');
  assert.equal(unitPriceFor({ price: 5, saleType: 'G' }, 'ccf'), '4.42477876', '8 decimals, as the price mask allows');
  assert.equal(unitPriceFor({ price: 5, saleType: 'E' }, 'ccf'), '5', 'exempt items carry no IVA');
  assert.equal(unitPriceFor({ price: 5, saleType: 'N' }, 'ccf'), '5');
  assert.equal(unitPriceFor({ price: 11.3, saleType: 'G' }, 'cf'), '11.3', 'CF takes the final price as is');
  assert.equal(unitPriceFor({ price: 100, saleType: 'G' }, 'cf'), '100', 'trimming zeros must stop at the decimal point');
});

test('the CCF unit price plus 13% gives back the final price', () => {
  for (const price of [0.25, 1, 5, 9.99, 11.3, 1234.56]) {
    const net = Number(unitPriceFor({ price, saleType: 'G' }, 'ccf'));
    assert.equal(Math.round(net * 1.13 * 100) / 100, price, `${price}`);
  }
});

test('parsePrice accepts what people type and rejects the rest', () => {
  assert.equal(parsePrice('5'), 5);
  assert.equal(parsePrice('5,50'), 5.5, 'decimal comma');
  assert.equal(parsePrice(' $1,234.50 '), 1234.5, 'comma as thousands separator');
  assert.equal(parsePrice('0.12345678'), 0.12345678);
  assert.equal(parsePrice('0.123456789'), null, 'more decimals than the portal accepts');
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('0'), null);
  assert.equal(parsePrice('-5'), null);
  assert.equal(parsePrice('cinco'), null);
});

test('formatAmount writes numbers the way the portal fields take them', () => {
  assert.equal(formatAmount(3), '3');
  assert.equal(formatAmount(2.5), '2.5');
  assert.equal(formatAmount(0.00000001), '0.00000001', 'never exponent notation');
});
