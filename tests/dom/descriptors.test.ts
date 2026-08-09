// Zero matches: the portal renamed a control; two: the issuer leaked in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, fixturesAvailable, loadFixture } from '../helpers/fixtures.ts';
import { recipientRoot } from '../../src/content/forms/detect.ts';
import { CF_SCHEMA } from '../../src/content/forms/cf.ts';
import { CCF_SCHEMA } from '../../src/content/forms/ccf.ts';
import type { FormSchema } from '../../src/content/forms/schema.ts';

const skip = fixturesAvailable() ? false : SKIP_REASON;

function checkSchema(schema: FormSchema): void {
  const root: HTMLElement | null = recipientRoot(schema.id);
  if (!root) throw new Error(`Recipient root not found for ${schema.id}.`);

  for (const field of schema.fields) {
    if (!field.control) continue; // dynamicDoc: doesn't exist until a type is chosen

    const matches: NodeListOf<Element> = root.querySelectorAll(`[formcontrolname="${field.control}"]`);
    assert.equal(
      matches.length,
      1,
      `${schema.id}: "${field.key}" (formcontrolname="${field.control}") resolved to ${matches.length} elements.`,
    );
  }
}

test('CCF: every descriptor resolves to a single element', { skip }, () => {
  loadFixture('ccf');
  checkSchema(CCF_SCHEMA);
});

test('CF: every descriptor resolves to a single element', { skip }, () => {
  loadFixture('cf');
  checkSchema(CF_SCHEMA);
});

test('CF declares the document number as a deferred field with no fixed control', { skip }, () => {
  const docNumber = CF_SCHEMA.fields.find((f) => f.key === 'docNumber');
  assert.ok(docNumber);
  assert.equal(docNumber.kind, 'dynamicDoc');
  assert.equal(docNumber.control, undefined);
  assert.equal(docNumber.dependsOn, 'docType', 'It must be written after choosing the type.');
});

test('CCF has no document type and CF has no trade name', { skip }, () => {
  assert.equal(CCF_SCHEMA.fields.some((f) => f.key === 'docType'), false);
  assert.equal(CF_SCHEMA.fields.some((f) => f.key === 'tradeName'), false);
});

test('CCF leaves trade name empty instead of copying the legal name', () => {
  const tradeName = CCF_SCHEMA.fields.find((f) => f.key === 'tradeName');
  assert.ok(tradeName);

  const base = {
    id: 'x',
    name: 'Distribuidora Morazán, S.A. de C.V.',
    docType: '36' as const,
    docNumber: '06141201851023',
    address: { department: '', municipality: '', district: '', details: '' },
    createdAt: 0,
    updatedAt: 0,
  };

  assert.equal(tradeName.value({ ...base, tradeName: 'La Morazán' }), 'La Morazán');
  assert.equal(
    tradeName.value(base),
    null,
    'without a trade name it must be omitted; copying the legal name would invent data the recipient never declared',
  );
});
