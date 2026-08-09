// SPDX-License-Identifier: MIT

import test from 'node:test';
import assert from 'node:assert/strict';
import { docFieldFor, validateDraft, validateField } from '../../src/common/validate.ts';
import { emptyDireccion } from '../../src/common/types.ts';

test('el NIT acepta 14 dígitos y también 9 (DUI como NIT)', () => {
  assert.equal(validateField('nit', '06141201851023'), null);
  assert.equal(validateField('nit', '012345678'), null);
  assert.ok(validateField('nit', '0614120185102'), 'trece dígitos no es ninguna de las dos formas');
  assert.ok(validateField('nit', '0614-120185-102-3'), 'los guiones deben normalizarse antes de validar');
});

test('el NRC se limita a 7 dígitos, como la máscara del portal', () => {
  assert.equal(validateField('nrc', '1234567'), null);
  assert.equal(validateField('nrc', '12'), null);
  assert.ok(validateField('nrc', '12345678'));
  assert.ok(validateField('nrc', '1'));
});

test('el teléfono son 8 dígitos sin guion', () => {
  assert.equal(validateField('telefono', '22221234'), null);
  assert.ok(validateField('telefono', '2222-1234'));
});

test('el correo se valida por forma y por longitud', () => {
  assert.equal(validateField('correo', 'a@b.sv'), null);
  assert.ok(validateField('correo', 'sin-arroba.sv'));
  assert.equal(validateField('correo', `${'a'.repeat(95)}@b.sv`), null, '100 caracteres justos: el límite del portal');
  assert.ok(validateField('correo', `${'a'.repeat(96)}@b.sv`), '101 caracteres: pasa del límite');
});

test('un campo vacío no es un campo inválido', () => {
  for (const field of ['nit', 'nrc', 'correo', 'telefono'] as const) {
    assert.equal(validateField(field, ''), null);
  }
});

test('docFieldFor mapea cada tipo a su regla', () => {
  assert.equal(docFieldFor('36'), 'nit');
  assert.equal(docFieldFor('13'), 'dui');
  assert.equal(docFieldFor('03'), 'pasaporte');
  assert.equal(docFieldFor('02'), 'carnetResidente');
  assert.equal(docFieldFor('37'), 'otro');
});

test('validateDraft solo exige nombre y número de documento', () => {
  const errors = validateDraft({
    nombre: 'Ferretería La Esquina',
    docType: '36',
    docNumber: '06141201851023',
    direccion: emptyDireccion(),
  });

  assert.deepEqual(errors, {}, 'un cliente solo-factura, sin NRC ni correo, es válido');
});

test('validateDraft señala el nombre vacío y el documento que no cuadra con su tipo', () => {
  const errors = validateDraft({ nombre: '  ', docType: '13', docNumber: '123', direccion: emptyDireccion() });

  assert.ok(errors.nombre);
  assert.ok(errors.docNumber, 'un DUI de 3 dígitos no es válido');
});
