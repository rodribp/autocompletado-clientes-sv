// SPDX-License-Identifier: MIT
//
// La prueba de mayor valor del proyecto.
//
// El portal repite `formcontrolname` entre Emisor y Receptor. Si una consulta se
// escapa de la raíz del receptor no salta ningún error: se sobrescriben los datos
// fiscales del propio usuario y eso acaba en un documento emitido mal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_REASON, fixturesAvailable, loadFixture } from '../helpers/fixtures.ts';
import { q, receptorRoot } from '../../src/content/forms/detect.ts';

const skip = fixturesAvailable() ? false : SKIP_REASON;

/** Controles que existen tanto en el Emisor como en el Receptor de CCF. */
const COLISIONES_CCF = ['correo', 'telefono', 'nombreComercial', 'actividadEconomica', 'descActividad', 'distrito'];

test('CCF: cada control en colisión aparece dos veces en el documento', { skip }, () => {
  loadFixture('ccf');

  for (const control of COLISIONES_CCF) {
    const todos = document.querySelectorAll(`[formcontrolname="${control}"]`);
    assert.equal(
      todos.length,
      2,
      `Se esperaban 2 «${control}» (emisor y receptor). Si el portal cambió, revisa las tablas de descriptores.`,
    );
  }
});

test('CCF: q() acotado devuelve el control del receptor, nunca el del emisor', { skip }, () => {
  loadFixture('ccf');

  const root = receptorRoot('ccf');
  assert.ok(root, 'No se encontró <app-common-receptor>.');

  const emisor = document.querySelector('app-common-emisor');
  assert.ok(emisor, 'No se encontró <app-common-emisor>; la prueba perdería sentido.');

  for (const control of COLISIONES_CCF) {
    const delReceptor = q(root, control);
    assert.ok(delReceptor, `q(root, "${control}") no encontró nada.`);
    assert.ok(
      !emisor.contains(delReceptor),
      `q(root, "${control}") devolvió un control que está dentro del Emisor.`,
    );
    assert.ok(root.contains(delReceptor), `q(root, "${control}") devolvió algo fuera del receptor.`);
  }
});

test('CCF: hoy una consulta global acierta solo por el orden de las pestañas', { skip }, () => {
  loadFixture('ccf');

  const root = receptorRoot('ccf')!;

  // Dato incómodo: en CCF la pestaña Receptor va antes que la Emisor, así que
  // `querySelector` global devuelve el control correcto **por casualidad**. No
  // es una garantía: basta con que el portal invierta las pestañas para que
  // empiece a escribir en los datos del emisor, sin ningún error visible.
  // Acotar convierte esa casualidad en algo explícito.
  for (const control of COLISIONES_CCF) {
    assert.equal(
      document.querySelector(`[formcontrolname="${control}"]`),
      q(root, control),
      `Cambió el orden del DOM en «${control}»: acotar ya no es opcional, es lo único que evita corromper al emisor.`,
    );
  }
});

test('CF: los nombres de CCF apuntan al EMISOR, no al receptor', { skip }, () => {
  loadFixture('cf');

  const emisor = document.querySelector('app-common-emisor');
  assert.ok(emisor);

  // El peligro concreto del proyecto, y la razón de tener una tabla de campos
  // por formulario en vez de una compartida: en CF el receptor se llama
  // `correoReceptor`, `telefonoReceptor` y `codActividad`. Los nombres de CCF
  // existen en esta página, pero pertenecen al EMISOR. Reutilizarlos escribiría
  // los datos del cliente sobre los datos fiscales del propio usuario.
  for (const control of ['correo', 'telefono', 'nombreComercial', 'actividadEconomica']) {
    const encontrado = document.querySelector(`[formcontrolname="${control}"]`);
    assert.ok(encontrado, `«${control}» debería existir en CF (en el emisor).`);
    assert.ok(
      emisor.contains(encontrado),
      `«${control}» dejó de pertenecer al emisor en CF; revisa las tablas de descriptores.`,
    );
  }
});

test('CF: la tabla de descriptores usa los nombres propios del receptor', { skip }, () => {
  loadFixture('cf');

  const root = receptorRoot('cf')!;
  const emisor = document.querySelector('app-common-emisor')!;

  for (const control of ['correoReceptor', 'telefonoReceptor', 'codActividad']) {
    const encontrado = q(root, control);
    assert.ok(encontrado, `«${control}» no se encontró en el receptor de CF.`);
    assert.ok(!emisor.contains(encontrado), `«${control}» cayó dentro del emisor.`);
  }
});

test('CF: los controles del receptor no están dentro de <app-common-emisor>', { skip }, () => {
  loadFixture('cf');

  const root = receptorRoot('cf');
  assert.ok(root, 'No se encontró la pestaña Receptor de CF.');

  const emisor = document.querySelector('app-common-emisor');
  assert.ok(emisor);

  for (const control of ['nombre', 'nrc', 'codActividad', 'departamento', 'correoReceptor', 'telefonoReceptor']) {
    const el = q(root, control);
    assert.ok(el, `q(root, "${control}") no encontró nada en CF.`);
    assert.ok(!emisor.contains(el), `«${control}» quedó dentro del Emisor.`);
  }
});
