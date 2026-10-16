import test from 'node:test';
import assert from 'node:assert/strict';
import { docFieldFor, validateDraft, validateField, validateProduct } from '../../src/common/validate.ts';
import { emptyAddress } from '../../src/common/types.ts';

test('NIT accepts 14 digits and also 9 (DUI as NIT)', () => {
  assert.equal(validateField('nit', '06141201851023'), null);
  assert.equal(validateField('nit', '012345678'), null);
  assert.ok(validateField('nit', '0614120185102'), 'thirteen digits matches neither form');
  assert.ok(validateField('nit', '0614-120185-102-3'), 'dashes must be normalized before validating');
});

test('NRC is capped at 7 digits, like the portal mask', () => {
  assert.equal(validateField('nrc', '1234567'), null);
  assert.equal(validateField('nrc', '12'), null);
  assert.ok(validateField('nrc', '12345678'));
  assert.ok(validateField('nrc', '1'));
});

test('phone is 8 digits without a dash', () => {
  assert.equal(validateField('phone', '22221234'), null);
  assert.ok(validateField('phone', '2222-1234'));
});

test('email is validated by shape and length', () => {
  assert.equal(validateField('email', 'a@b.sv'), null);
  assert.ok(validateField('email', 'sin-arroba.sv'));
  assert.equal(validateField('email', `${'a'.repeat(95)}@b.sv`), null, 'exactly 100 characters: the portal limit');
  assert.ok(validateField('email', `${'a'.repeat(96)}@b.sv`), '101 characters: over the limit');
});

test('an empty field is not an invalid field', () => {
  for (const field of ['nit', 'nrc', 'email', 'phone'] as const) {
    assert.equal(validateField(field, ''), null);
  }
});

test('docFieldFor maps each type to its rule', () => {
  assert.equal(docFieldFor('36'), 'nit');
  assert.equal(docFieldFor('13'), 'dui');
  assert.equal(docFieldFor('03'), 'passport');
  assert.equal(docFieldFor('02'), 'residentCard');
  assert.equal(docFieldFor('37'), 'other');
});

test('validateDraft only requires name and document number', () => {
  const errors = validateDraft({
    name: 'Ferretería La Esquina',
    docType: '36',
    docNumber: '06141201851023',
    address: emptyAddress(),
  });

  assert.deepEqual(errors, {}, 'an invoice-only customer, with no NRC or email, is valid');
});

test('validateDraft flags an empty name and a document that does not match its type', () => {
  const errors = validateDraft({ name: '  ', docType: '13', docNumber: '123', address: emptyAddress() });

  assert.ok(errors.name);
  assert.ok(errors.docNumber, 'a 3-digit DUI is not valid');
});

test('validateProduct requires a description and a positive price', () => {
  const ok = { description: 'Consultoría', itemType: '2' as const, unit: '59', saleType: 'G' as const, price: 50 };
  assert.deepEqual(validateProduct(ok), {});

  const errors = validateProduct({ ...ok, description: ' ', price: NaN, unit: '1000', code: 'x'.repeat(26) });
  assert.deepEqual(Object.keys(errors).sort(), ['code', 'description', 'price', 'unit']);
  assert.ok(validateProduct({ ...ok, price: 0 }).price);
});
