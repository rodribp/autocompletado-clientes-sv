// SPDX-License-Identifier: MIT

import test from 'node:test';
import assert from 'node:assert/strict';
import { ccfIssues, isDocType, nitParaCcf } from '../../src/common/types.ts';

const completo = { docType: '36' as const, docNumber: '06141201851023', nrc: '1234567' };

test('un cliente con NIT y NRC es apto para crédito fiscal', () => {
  assert.deepEqual(ccfIssues(completo), []);
});

test('el nombre comercial no condiciona la aptitud para CCF', () => {
  // Su input lleva `required` en el HTML del portal, pero en la práctica es
  // opcional: un cliente sin nombre comercial sigue siendo apto.
  assert.deepEqual(ccfIssues(completo), []);
});

test('sin NRC se avisa', () => {
  assert.equal(ccfIssues({ ...completo, nrc: undefined }).length, 1);
});

test('pasaporte y carnet de residente descartan el crédito fiscal', () => {
  for (const docType of ['03', '02', '37'] as const) {
    const issues = ccfIssues({ ...completo, docType });
    assert.ok(issues.some((i) => i.includes('NIT ni DUI')), `${docType} debería avisar`);
  }
});

test('el DUI hace de NIT para persona natural', () => {
  assert.equal(nitParaCcf({ docType: '13', docNumber: '012345678' }), '012345678');
  assert.equal(nitParaCcf({ docType: '36', docNumber: '06141201851023' }), '06141201851023');
  assert.equal(nitParaCcf({ docType: '03', docNumber: 'A1234567' }), null);
});

test('isDocType rechaza códigos que no existen', () => {
  assert.equal(isDocType('36'), true);
  assert.equal(isDocType('99'), false);
  assert.equal(isDocType(36), false);
});
