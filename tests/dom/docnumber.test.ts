// CF's document number isn't rendered in the snapshot: these tests only locate its slot.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, fixturesAvailable, loadFixture } from '../helpers/fixtures.ts';
import { q, recipientRoot } from '../../src/content/forms/detect.ts';
import { discoverDocNumberField } from '../../src/content/forms/fill.ts';
import { CF_KNOWN_CONTROLS } from '../../src/content/forms/cf.ts';

const skip = fixturesAvailable() ? false : SKIP_REASON;

test('the number slot exists and contains only *ngIf comments', { skip }, () => {
  loadFixture('cf');
  const root = recipientRoot('cf')!;

  const typeSelect = q<HTMLSelectElement>(root, 'tipoDocumento');
  assert.ok(typeSelect, 'Document type select not found.');

  const row = typeSelect.closest('div.form-group.row');
  assert.ok(row, 'The select should be inside a div.form-group.row.');

  const columns = row.querySelectorAll(':scope > div.col-sm-6');
  assert.equal(columns.length, 2, 'The row should have two columns: type and number.');

  const slot = columns[1]!.querySelector(':scope > div.col-sm-12');
  assert.ok(slot, 'Number container not found.');
  assert.equal(slot.children.length, 0, 'There should be no elements yet.');

  const comments = [...slot.childNodes].filter((n) => n.nodeType === 8 /* COMMENT_NODE */);
  assert.equal(comments.length, 3, 'Expected three *ngIf anchors (one per document variant).');
});

test('the type select offers the five official codes', { skip }, () => {
  loadFixture('cf');
  const typeSelect = q<HTMLSelectElement>(recipientRoot('cf')!, 'tipoDocumento')!;

  const codes = [...typeSelect.options]
    .map((o) => o.value.trim())
    // Angular serializes the placeholder as "0: null".
    .filter((v) => !/^\d+:\s/.test(v));

  assert.deepEqual(codes, ['36', '13', '03', '02', '37']);
});

test('discovery does not invent a field when there is none', { skip }, async () => {
  loadFixture('cf');
  const root = recipientRoot('cf')!;

  const found = await discoverDocNumberField(root);

  // Without Angular the type row is empty and the positional fallback has nowhere to look.
  assert.equal(found, null, 'Without the rendered variant, discovery must return null.');
});

test('known CF controls match what is on the page', { skip }, () => {
  loadFixture('cf');
  const root = recipientRoot('cf')!;

  // Discovery by elimination would mistake a new unregistered control for the number field.
  const onPage = new Set(
    [...root.querySelectorAll('[formcontrolname]')].map((el) => el.getAttribute('formcontrolname')!),
  );

  for (const control of onPage) {
    assert.ok(
      CF_KNOWN_CONTROLS.has(control),
      `"${control}" is in the CF recipient but not in CF_KNOWN_CONTROLS; discovery by elimination would take it for the number field.`,
    );
  }
});
