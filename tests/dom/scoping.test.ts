// The portal reuses `formcontrolname` across Emisor and Receptor: a query that escapes
// the recipient root silently overwrites the user's own tax data.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, fixturesAvailable, loadFixture } from '../helpers/fixtures.ts';
import { q, recipientRoot } from '../../src/content/forms/detect.ts';

const skip = fixturesAvailable() ? false : SKIP_REASON;

const CCF_COLLISIONS = ['correo', 'telefono', 'nombreComercial', 'actividadEconomica', 'descActividad', 'distrito'];

test('CCF: each colliding control appears twice in the document', { skip }, () => {
  loadFixture('ccf');

  for (const control of CCF_COLLISIONS) {
    const all = document.querySelectorAll(`[formcontrolname="${control}"]`);
    assert.equal(
      all.length,
      2,
      `Expected 2 "${control}" (issuer and recipient). If the portal changed, review the descriptor tables.`,
    );
  }
});

test('CCF: scoped q() returns the recipient control, never the issuer one', { skip }, () => {
  loadFixture('ccf');

  const root = recipientRoot('ccf');
  assert.ok(root, '<app-common-receptor> not found.');

  const issuer = document.querySelector('app-common-emisor');
  assert.ok(issuer, '<app-common-emisor> not found; the test would be meaningless.');

  for (const control of CCF_COLLISIONS) {
    const fromRecipient = q(root, control);
    assert.ok(fromRecipient, `q(root, "${control}") found nothing.`);
    assert.ok(
      !issuer.contains(fromRecipient),
      `q(root, "${control}") returned a control inside the Emisor.`,
    );
    assert.ok(root.contains(fromRecipient), `q(root, "${control}") returned something outside the recipient.`);
  }
});

test('CCF: today a global query is right only because of tab order', { skip }, () => {
  loadFixture('ccf');

  const root = recipientRoot('ccf')!;

  // If the portal swaps the tabs, a global query would write into the issuer with no error.
  for (const control of CCF_COLLISIONS) {
    assert.equal(
      document.querySelector(`[formcontrolname="${control}"]`),
      q(root, control),
      `DOM order changed for "${control}": scoping is no longer optional, it's the only thing preventing issuer corruption.`,
    );
  }
});

test('CF: CCF control names point to the ISSUER, not the recipient', { skip }, () => {
  loadFixture('cf');

  const issuer = document.querySelector('app-common-emisor');
  assert.ok(issuer);

  // Hence one field table per form: in CF the recipient uses `correoReceptor`,
  // `telefonoReceptor` and `codActividad`.
  for (const control of ['correo', 'telefono', 'nombreComercial', 'actividadEconomica']) {
    const found = document.querySelector(`[formcontrolname="${control}"]`);
    assert.ok(found, `"${control}" should exist in CF (in the issuer).`);
    assert.ok(
      issuer.contains(found),
      `"${control}" no longer belongs to the issuer in CF; review the descriptor tables.`,
    );
  }
});

test('CF: the descriptor table uses the recipient-specific names', { skip }, () => {
  loadFixture('cf');

  const root = recipientRoot('cf')!;
  const issuer = document.querySelector('app-common-emisor')!;

  for (const control of ['correoReceptor', 'telefonoReceptor', 'codActividad']) {
    const found = q(root, control);
    assert.ok(found, `"${control}" not found in the CF recipient.`);
    assert.ok(!issuer.contains(found), `"${control}" landed inside the issuer.`);
  }
});

test('CF: recipient controls are not inside <app-common-emisor>', { skip }, () => {
  loadFixture('cf');

  const root = recipientRoot('cf');
  assert.ok(root, 'CF Receptor tab not found.');

  const issuer = document.querySelector('app-common-emisor');
  assert.ok(issuer);

  for (const control of ['nombre', 'nrc', 'codActividad', 'departamento', 'correoReceptor', 'telefonoReceptor']) {
    const el = q(root, control);
    assert.ok(el, `q(root, "${control}") found nothing in CF.`);
    assert.ok(!issuer.contains(el), `"${control}" ended up inside the Emisor.`);
  }
});
