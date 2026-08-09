// SPDX-License-Identifier: MIT

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, fixturesAvailable, loadFixture } from '../helpers/fixtures.ts';
import { detectFormType, receptorRoot } from '../../src/content/forms/detect.ts';

const skip = fixturesAvailable() ? false : SKIP_REASON;

test('detectFormType distingue las dos páginas', { skip }, () => {
  loadFixture('cf');
  assert.equal(detectFormType(), 'cf');

  loadFixture('ccf');
  assert.equal(detectFormType(), 'ccf');
});

test('CCF envuelve el receptor en <app-common-receptor>', { skip }, () => {
  loadFixture('ccf');
  const root = receptorRoot('ccf');
  assert.ok(root);
  assert.equal(root.tagName.toLowerCase(), 'app-common-receptor');
});

test('CF NO usa <app-common-receptor> pese al nombre «common»', { skip }, () => {
  loadFixture('cf');

  assert.equal(
    document.querySelector('app-common-receptor'),
    null,
    'Si CF empezó a usar app-common-receptor, receptorRoot() puede simplificarse.',
  );

  const root = receptorRoot('cf');
  assert.ok(root, 'No se encontró tab[heading="Receptor"] dentro de app-facturador-cf.');
  assert.equal(root.tagName.toLowerCase(), 'tab');
});
