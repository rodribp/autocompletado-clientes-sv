import test from 'node:test';
import assert from 'node:assert/strict';
import { ccfIssues, isDocType, nitForCcf } from '../../src/common/types.ts';

const complete = { docType: '36' as const, docNumber: '06141201851023', nrc: '1234567' };

test('a customer with NIT and NRC is CCF-eligible', () => {
  assert.deepEqual(ccfIssues(complete), []);
});

test('trade name does not affect CCF eligibility', () => {
  // The portal marks it `required`, but in practice it's optional.
  assert.deepEqual(ccfIssues(complete), []);
});

test('missing NRC is flagged', () => {
  assert.equal(ccfIssues({ ...complete, nrc: undefined }).length, 1);
});

test('passport and resident card rule out CCF', () => {
  for (const docType of ['03', '02', '37'] as const) {
    const issues = ccfIssues({ ...complete, docType });
    assert.ok(issues.some((i) => i.includes('NIT ni DUI')), `${docType} should be flagged`);
  }
});

test('DUI acts as NIT for individuals', () => {
  assert.equal(nitForCcf({ docType: '13', docNumber: '012345678' }), '012345678');
  assert.equal(nitForCcf({ docType: '36', docNumber: '06141201851023' }), '06141201851023');
  assert.equal(nitForCcf({ docType: '03', docNumber: 'A1234567' }), null);
});

test('isDocType rejects unknown codes', () => {
  assert.equal(isDocType('36'), true);
  assert.equal(isDocType('99'), false);
  assert.equal(isDocType(36), false);
});
