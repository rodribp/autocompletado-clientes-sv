import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, fixturesAvailable, loadFixture } from '../helpers/fixtures.ts';
import { detectFormType, recipientRoot } from '../../src/content/forms/detect.ts';

const skip = fixturesAvailable() ? false : SKIP_REASON;

test('detectFormType tells the two pages apart', { skip }, () => {
  loadFixture('cf');
  assert.equal(detectFormType(), 'cf');

  loadFixture('ccf');
  assert.equal(detectFormType(), 'ccf');
});

test('CCF wraps the recipient in <app-common-receptor>', { skip }, () => {
  loadFixture('ccf');
  const root = recipientRoot('ccf');
  assert.ok(root);
  assert.equal(root.tagName.toLowerCase(), 'app-common-receptor');
});

test('CF does NOT use <app-common-receptor> despite the "common" name', { skip }, () => {
  loadFixture('cf');

  assert.equal(
    document.querySelector('app-common-receptor'),
    null,
    'If CF started using app-common-receptor, recipientRoot() can be simplified.',
  );

  const root = recipientRoot('cf');
  assert.ok(root, 'tab[heading="Receptor"] not found inside app-facturador-cf.');
  assert.equal(root.tagName.toLowerCase(), 'tab');
});
