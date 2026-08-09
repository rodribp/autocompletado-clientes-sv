// SPDX-License-Identifier: MIT
//
// Comprobante de Crédito Fiscal (/ccf), dentro de <app-common-receptor>.
//
// El receptor es siempre un contribuyente inscrito, así que no se pregunta el
// tipo de documento: se pide el NIT, de 9 a 14 dígitos. Los 9 son el DUI de
// persona natural haciendo de NIT.

import { actividadLabel } from '../../common/normalize.js';
import { nitParaCcf } from '../../common/types.js';
import type { FormSchema } from './schema.js';

export const CCF_SCHEMA: FormSchema = {
  id: 'ccf',
  fields: [
    {
      key: 'nit',
      control: 'nit',
      kind: 'text',
      order: 10,
      maxlength: 14,
      // `null` aquí significa «no apto para CCF», no «sin dato»; ver `fill.ts`.
      value: (c) => nitParaCcf(c),
    },
    {
      key: 'nombre',
      control: 'nombre',
      kind: 'text',
      order: 20,
      maxlength: 250,
      value: (c) => c.nombre || null,
    },
    {
      key: 'nrc',
      control: 'nrc',
      kind: 'text',
      order: 30,
      maxlength: 7,
      value: (c) => c.nrc || null,
    },
    {
      key: 'nombreComercial',
      control: 'nombreComercial',
      kind: 'text',
      order: 40,
      maxlength: 150,
      // El input lleva `required` en el HTML, pero en la práctica no lo es. Si
      // el cliente no tiene nombre comercial, se deja vacío: copiar aquí la
      // razón social inventaría un dato que el receptor no declaró.
      value: (c) => c.nombreComercial || null,
    },
    {
      key: 'actividad',
      control: 'actividadEconomica',
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
      control: 'correo',
      kind: 'text',
      order: 100,
      maxlength: 100,
      value: (c) => c.correo || null,
    },
    {
      key: 'telefono',
      control: 'telefono',
      kind: 'text',
      order: 110,
      maxlength: 8,
      value: (c) => c.telefono || null,
    },
  ],
};
