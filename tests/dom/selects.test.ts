// `<select>`s are matched by `value`, never by text.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, fixturesAvailable, loadFixture } from '../helpers/fixtures.ts';
import { q, recipientRoot } from '../../src/content/forms/detect.ts';
import { setSelect } from '../../src/content/dom.ts';

const skip = fixturesAvailable() ? false : SKIP_REASON;

test('the 15 departments come pre-rendered with two-digit codes', { skip }, () => {
  for (const name of ['cf', 'ccf'] as const) {
    loadFixture(name);
    const root = recipientRoot(name)!;
    const select = q<HTMLSelectElement>(root, 'departamento')!;

    const codes = [...select.options].map((o) => o.value.trim());
    assert.equal(codes.length, 15, `${name}: expected 15 departments.`);
    assert.deepEqual(codes.slice(0, 3), ['00', '01', '02'], `${name}: codes with leading zero.`);
  }
});

test('setSelect finds a department by code on both pages', { skip }, () => {
  for (const name of ['cf', 'ccf'] as const) {
    loadFixture(name);
    const root = recipientRoot(name)!;
    const select = q<HTMLSelectElement>(root, 'departamento')!;

    assert.equal(setSelect(select, '06'), true, `${name}: could not select San Salvador.`);
    assert.equal(select.value, '06');
  }
});

test('labels are NOT reliable: CCF adds whitespace that CF lacks', { skip }, () => {
  loadFixture('cf');
  const cfText = [...q<HTMLSelectElement>(recipientRoot('cf')!, 'departamento')!.options]
    .find((o) => o.value.trim() === '01')!.textContent!;

  loadFixture('ccf');
  const ccfText = [...q<HTMLSelectElement>(recipientRoot('ccf')!, 'departamento')!.options]
    .find((o) => o.value.trim() === '01')!.textContent!;

  assert.notEqual(
    cfText,
    ccfText,
    'Even if labels now match, matching by text is still forbidden: codes are the official source.',
  );
  assert.equal(cfText.trim(), ccfText.trim(), 'Once trimmed, they should match.');
});

test('CF arrives with empty municipality and district: the cascade has not run', { skip }, () => {
  loadFixture('cf');
  const root = recipientRoot('cf')!;

  for (const control of ['municipio', 'distrito']) {
    const select = q<HTMLSelectElement>(root, control)!;
    assert.equal(select.options.length, 0, `${control} should be empty until Angular populates it.`);
    assert.equal(setSelect(select, '20'), false, 'setSelect must report that the option does not exist yet.');
  }
});

test('CCF was captured with the cascade already populated', { skip }, () => {
  loadFixture('ccf');
  const root = recipientRoot('ccf')!;

  const municipalities = [...q<HTMLSelectElement>(root, 'municipio')!.options].map((o) => o.value.trim());
  assert.ok(municipalities.includes('23'), 'Expected San Salvador Centro (23) in the snapshot.');

  const districts = [...q<HTMLSelectElement>(root, 'distrito')!.options];
  assert.ok(districts.length > 0);
  assert.notEqual(districts[0]!.textContent, districts[0]!.textContent!.trim());
});
