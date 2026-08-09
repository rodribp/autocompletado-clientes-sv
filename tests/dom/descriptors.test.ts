// SPDX-License-Identifier: MIT
//
// Cada descriptor debe resolverse a **exactamente un** elemento bajo la raíz
// del receptor. Ni cero (el portal cambió un nombre) ni dos (se coló el
// emisor).

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, fixturesAvailable, loadFixture } from '../helpers/fixtures.ts';
import { receptorRoot } from '../../src/content/forms/detect.ts';
import { CF_SCHEMA } from '../../src/content/forms/cf.ts';
import { CCF_SCHEMA } from '../../src/content/forms/ccf.ts';
import type { FormSchema } from '../../src/content/forms/schema.ts';

const skip = fixturesAvailable() ? false : SKIP_REASON;

function checkSchema(schema: FormSchema): void {
  const root: HTMLElement | null = receptorRoot(schema.id);
  if (!root) throw new Error(`No se encontró la raíz del receptor de ${schema.id}.`);

  for (const field of schema.fields) {
    if (!field.control) continue; // dynamicDoc: no existe hasta elegir el tipo

    const encontrados: NodeListOf<Element> = root.querySelectorAll(`[formcontrolname="${field.control}"]`);
    assert.equal(
      encontrados.length,
      1,
      `${schema.id}: «${field.key}» (formcontrolname="${field.control}") resolvió ${encontrados.length} elementos.`,
    );
  }
}

test('CCF: todos los descriptores resuelven a un único elemento', { skip }, () => {
  loadFixture('ccf');
  checkSchema(CCF_SCHEMA);
});

test('CF: todos los descriptores resuelven a un único elemento', { skip }, () => {
  loadFixture('cf');
  checkSchema(CF_SCHEMA);
});

test('CF declara el número de documento como campo diferido, sin control fijo', { skip }, () => {
  const docNumber = CF_SCHEMA.fields.find((f) => f.key === 'docNumber');
  assert.ok(docNumber);
  assert.equal(docNumber.kind, 'dynamicDoc');
  assert.equal(docNumber.control, undefined);
  assert.equal(docNumber.dependsOn, 'tipoDocumento', 'Debe escribirse después de elegir el tipo.');
});

test('CCF no tiene tipo de documento y CF no tiene nombre comercial', { skip }, () => {
  assert.equal(CCF_SCHEMA.fields.some((f) => f.key === 'tipoDocumento'), false);
  assert.equal(CF_SCHEMA.fields.some((f) => f.key === 'nombreComercial'), false);
});

test('CCF deja vacío el nombre comercial en vez de copiar la razón social', () => {
  const campo = CCF_SCHEMA.fields.find((f) => f.key === 'nombreComercial');
  assert.ok(campo);

  const base = {
    id: 'x',
    nombre: 'Distribuidora Morazán, S.A. de C.V.',
    docType: '36' as const,
    docNumber: '06141201851023',
    direccion: { departamento: '', municipio: '', distrito: '', complemento: '' },
    createdAt: 0,
    updatedAt: 0,
  };

  assert.equal(campo.value({ ...base, nombreComercial: 'La Morazán' }), 'La Morazán');
  assert.equal(
    campo.value(base),
    null,
    'sin nombre comercial debe omitirse; copiar la razón social inventaría un dato que el receptor no declaró',
  );
});
