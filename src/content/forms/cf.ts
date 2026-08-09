import { activityLabel } from '../../common/normalize.js';
import type { FormSchema } from './schema.js';

// Any control not listed here is, by elimination, the document number.
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
      key: 'docType',
      control: 'tipoDocumento',
      kind: 'select',
      order: 10,
      value: (c) => c.docType || null,
    },
    {
      key: 'docNumber',
      // No `control`: found by `discoverDocNumberField`.
      kind: 'dynamicDoc',
      order: 20,
      dependsOn: 'docType',
      value: (c) => c.docNumber || null,
    },
    {
      key: 'name',
      control: 'nombre',
      kind: 'text',
      order: 30,
      maxlength: 250,
      value: (c) => c.name || null,
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
      key: 'activity',
      control: 'codActividad',
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
      control: 'correoReceptor',
      kind: 'text',
      order: 100,
      maxlength: 100,
      value: (c) => c.email || null,
    },
    {
      key: 'phone',
      control: 'telefonoReceptor',
      kind: 'text',
      order: 110,
      maxlength: 8,
      value: (c) => c.phone || null,
    },
  ],
};
