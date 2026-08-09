// SPDX-License-Identifier: MIT
//
// El «Número Documento de Identificación» de CF, la mayor incógnita del
// proyecto: en el snapshot no está renderizado. Sin Angular solo se puede
// comprobar que localizamos el hueco; la escritura, contra el portal real.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, fixturesAvailable, loadFixture } from '../helpers/fixtures.ts';
import { q, receptorRoot } from '../../src/content/forms/detect.ts';
import { discoverDocNumberField } from '../../src/content/forms/fill.ts';
import { CF_KNOWN_CONTROLS } from '../../src/content/forms/cf.ts';

const skip = fixturesAvailable() ? false : SKIP_REASON;

test('el hueco del número existe y contiene solo comentarios *ngIf', { skip }, () => {
  loadFixture('cf');
  const root = receptorRoot('cf')!;

  const tipo = q<HTMLSelectElement>(root, 'tipoDocumento');
  assert.ok(tipo, 'No se encontró el select de tipo de documento.');

  const row = tipo.closest('div.form-group.row');
  assert.ok(row, 'El select debería estar dentro de un div.form-group.row.');

  const columnas = row.querySelectorAll(':scope > div.col-sm-6');
  assert.equal(columnas.length, 2, 'La fila debería tener dos columnas: tipo y número.');

  const hueco = columnas[1]!.querySelector(':scope > div.col-sm-12');
  assert.ok(hueco, 'No se encontró el contenedor del número.');
  assert.equal(hueco.children.length, 0, 'No debería haber ningún elemento todavía.');

  const comentarios = [...hueco.childNodes].filter((n) => n.nodeType === 8 /* COMMENT_NODE */);
  assert.equal(comentarios.length, 3, 'Se esperaban tres anclas *ngIf (una por variante de documento).');
});

test('el select de tipo ofrece los cinco códigos oficiales', { skip }, () => {
  loadFixture('cf');
  const tipo = q<HTMLSelectElement>(receptorRoot('cf')!, 'tipoDocumento')!;

  const codigos = [...tipo.options]
    .map((o) => o.value.trim())
    // Angular serializa el marcador de posición como «0: null».
    .filter((v) => !/^\d+:\s/.test(v));

  assert.deepEqual(codigos, ['36', '13', '03', '02', '37']);
});

test('el descubrimiento no inventa un campo cuando no hay ninguno', { skip }, async () => {
  loadFixture('cf');
  const root = receptorRoot('cf')!;

  const found = await discoverDocNumberField(root);

  // Sin Angular no se renderiza nada, y el respaldo posicional busca dentro de
  // la fila del tipo, que está vacía. Debe rendirse limpiamente.
  assert.equal(found, null, 'Sin la variante renderizada, el descubrimiento debe devolver null.');
});

test('los controles conocidos de CF coinciden con lo que hay en la página', { skip }, () => {
  loadFixture('cf');
  const root = receptorRoot('cf')!;

  // El barrido «por descarte» solo funciona si esta lista está al día: si el
  // portal añade un control al receptor y no lo registramos, lo confundiríamos
  // con el campo de número.
  const enPagina = new Set(
    [...root.querySelectorAll('[formcontrolname]')].map((el) => el.getAttribute('formcontrolname')!),
  );

  for (const control of enPagina) {
    assert.ok(
      CF_KNOWN_CONTROLS.has(control),
      `«${control}» está en el receptor de CF pero no en CF_KNOWN_CONTROLS; el descubrimiento por descarte lo tomaría por el campo de número.`,
    );
  }
});
