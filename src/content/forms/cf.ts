// SPDX-License-Identifier: MIT
//
// Factura / Consumidor Final (/cf). Los campos están en la plantilla de
// `<app-facturador-cf>`; esta página no usa `<app-common-receptor>`.
//
// Frente a CCF: el correo y el teléfono son `correoReceptor`/`telefonoReceptor`,
// la actividad es `codActividad`, no hay nombre comercial, y sí hay tipo de
// documento —cuyo número no existe en el DOM hasta elegirlo—.

import { actividadLabel } from '../../common/normalize.js';
import type { FormSchema } from './schema.js';

/**
 * Los `formcontrolname` conocidos del receptor de CF: lo que aparezca y no esté
 * aquí es, por descarte, el campo de número de documento.
 */
export const CF_KNOWN_CONTROLS = new Set([
  'tipoDocumento',
  'nombre',
  'nrc',
  'codActividad',
  'descActividad',
  'departamento',
  'municipio',
  'distrito',
  'complemento',
  'correoReceptor',
  'telefonoReceptor',
]);

export const CF_SCHEMA: FormSchema = {
  id: 'cf',
  fields: [
    {
      key: 'tipoDocumento',
      control: 'tipoDocumento',
      kind: 'select',
      order: 10,
      value: (c) => c.docType || null,
    },
    {
      key: 'docNumber',
      // Sin `control`: no lo sabemos. Ver `discoverDocNumberField` en fill.ts.
      kind: 'dynamicDoc',
      order: 20,
      dependsOn: 'tipoDocumento',
      value: (c) => c.docNumber || null,
    },
    {
      key: 'nombre',
      control: 'nombre',
      kind: 'text',
      order: 30,
      maxlength: 250,
      value: (c) => c.nombre || null,
    },
    {
      key: 'nrc',
      control: 'nrc',
      kind: 'text',
      order: 40,
      maxlength: 7,
      value: (c) => c.nrc || null,
    },
    {
      key: 'actividad',
      control: 'codActividad',
      kind: 'ngselect',
      order: 50,
      value: (c) => c.actividad?.codigo || null,
      label: (c) => (c.actividad ? actividadLabel(c.actividad) : ''),
    },
    {
      key: 'descActividad',
      control: 'descActividad',
      kind: 'text',
      order: 55,
      optional: true,
      maxlength: 150,
      value: (c) => c.actividad?.descripcion || null,
    },
    {
      key: 'departamento',
      control: 'departamento',
      kind: 'select',
      order: 60,
      value: (c) => c.direccion.departamento || null,
    },
    {
      key: 'municipio',
      control: 'municipio',
      kind: 'select',
      order: 70,
      dependsOn: 'departamento',
      value: (c) => c.direccion.municipio || null,
    },
    {
      key: 'distrito',
      control: 'distrito',
      kind: 'select',
      order: 80,
      dependsOn: 'municipio',
      value: (c) => c.direccion.distrito || null,
    },
    {
      key: 'complemento',
      control: 'complemento',
      kind: 'textarea',
      order: 90,
      maxlength: 200,
      value: (c) => c.direccion.complemento || null,
    },
    {
      key: 'correo',
      control: 'correoReceptor',
      kind: 'text',
      order: 100,
      maxlength: 100,
      value: (c) => c.correo || null,
    },
    {
      key: 'telefono',
      control: 'telefonoReceptor',
      kind: 'text',
      order: 110,
      maxlength: 8,
      value: (c) => c.telefono || null,
    },
  ],
};
