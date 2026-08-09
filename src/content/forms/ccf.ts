import { activityLabel } from '../../common/normalize.js';
import { nitForCcf } from '../../common/types.js';
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
      // `null` here means "not eligible for CCF", not "no data"; see `fill.ts`.
      value: (c) => nitForCcf(c),
    },
    {
      key: 'name',
      control: 'nombre',
      kind: 'text',
      order: 20,
      maxlength: 250,
      value: (c) => c.name || null,
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
      key: 'tradeName',
      control: 'nombreComercial',
      kind: 'text',
      order: 40,
      maxlength: 150,
      // `required` in the HTML but not in practice; copying the legal name
      // would invent data the recipient never declared.
      value: (c) => c.tradeName || null,
    },
    {
      key: 'activity',
      control: 'actividadEconomica',
      kind: 'ngselect',
      order: 50,
      value: (c) => c.activity?.code || null,
      label: (c) => (c.activity ? activityLabel(c.activity) : ''),
    },
    {
      key: 'activityDescription',
      control: 'descActividad',
      kind: 'text',
      order: 55,
      optional: true,
      maxlength: 150,
      value: (c) => c.activity?.description || null,
    },
    {
      key: 'department',
      control: 'departamento',
      kind: 'select',
      order: 60,
      value: (c) => c.address.department || null,
    },
    {
      key: 'municipality',
      control: 'municipio',
      kind: 'select',
      order: 70,
      dependsOn: 'department',
      value: (c) => c.address.municipality || null,
    },
    {
      key: 'district',
      control: 'distrito',
      kind: 'select',
      order: 80,
      dependsOn: 'municipality',
      value: (c) => c.address.district || null,
    },
    {
      key: 'details',
      control: 'complemento',
      kind: 'textarea',
      order: 90,
      maxlength: 200,
      value: (c) => c.address.details || null,
    },
    {
      key: 'email',
      control: 'correo',
      kind: 'text',
      order: 100,
      maxlength: 100,
      value: (c) => c.email || null,
    },
    {
      key: 'phone',
      control: 'telefono',
      kind: 'text',
      order: 110,
      maxlength: 8,
      value: (c) => c.phone || null,
    },
  ],
};
