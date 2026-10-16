// Spanish only: this centralizes UI text; it is not a translation system.

import type { FieldKey } from './messages.js';

export const T = {
  title: 'Clientes',
  offSite: 'Abre admin.factura.gob.sv para poder rellenar un documento.',
  wrongPage: 'Estás en el portal, pero no en una Factura (CF) ni en un Crédito Fiscal (CCF).',
  noContentScript: 'No se pudo conectar con la página. Recárgala e inténtalo de nuevo.',
  retry: 'Reintentar',

  search: 'Buscar por nombre, NIT o NRC',
  addNew: 'Nuevo cliente',
  saveCurrent: 'Guardar cliente actual',
  saveCurrentHelp: 'Lee el receptor que está en pantalla y lo guarda como cliente nuevo.',
  noCustomers: 'Todavía no tienes clientes. Crea uno, o abre un documento y usa «Guardar cliente actual».',
  noResults: 'Ningún cliente coincide con la búsqueda.',
  fill: 'Rellenar',
  edit: 'Editar',
  remove: 'Eliminar',
  cancel: 'Cancelar',
  confirmDelete: (name: string) => `¿Eliminar a ${name}?`,
  notCcfEligible: 'No apto para CCF',

  newCustomer: 'Nuevo cliente',
  editCustomer: 'Editar cliente',
  save: 'Guardar',
  back: 'Volver',
  fieldName: 'Nombre o razón social',
  fieldTradeName: 'Nombre comercial',
  fieldDocType: 'Tipo de documento',
  fieldDocNumber: 'Número de documento',
  fieldNrc: 'NRC',
  fieldActivityCode: 'Código de actividad económica',
  fieldActivityDescription: 'Descripción de la actividad',
  fieldDepartment: 'Departamento',
  fieldMunicipality: 'Municipio',
  fieldDistrict: 'Distrito',
  fieldAddressDetails: 'Complemento de dirección',
  fieldEmail: 'Correo electrónico',
  fieldPhone: 'Teléfono',
  fieldNotes: 'Notas',
  selectPlaceholder: '-- Seleccione --',
  municipalitiesNotLearned: 'Aún no conocemos los municipios de este departamento. Rellena un documento una vez y se aprenderán solos.',
  manualCode: 'Escribir código manualmente',

  exportBackup: 'Exportar respaldo (JSON)',
  importBackup: 'Importar respaldo (JSON)',
  diagnose: 'Diagnóstico',
  importedOk: (r: { imported: number; updated: number; skipped: number; products: number }) =>
    `Importados ${r.imported}, actualizados ${r.updated}` +
    (r.skipped > 0 ? `, omitidos ${r.skipped} por estar incompletos` : '') +
    (r.products > 0 ? `; ${r.products} ${r.products === 1 ? 'producto' : 'productos'}.` : '.'),

  filledOk: (n: number) => `Receptor rellenado (${n} ${n === 1 ? 'campo' : 'campos'}).`,
  filledPartial: (ok: number, missing: number) =>
    `Rellenado parcial: ${ok} ${ok === 1 ? 'campo' : 'campos'}, ${missing} sin completar.`,
  showDetails: 'Ver qué faltó',
  copy: 'Copiar',
  copied: 'Copiado',
  savedOk: 'Cliente guardado.',
  deletedOk: 'Cliente eliminado.',

  noProducts: 'Todavía no tienes productos. Pulsa «Nuevo» para guardar el primero.',
  noProductResults: 'Ningún producto coincide con la búsqueda.',
  newProduct: 'Nuevo producto',
  editProduct: 'Editar producto',
  productSavedOk: 'Producto guardado.',
  productDeletedOk: 'Producto eliminado.',
  noFill: 'No se pudo rellenar',
} as const;

export const SKIP_REASONS: Record<string, string> = {
  CONTROL_NOT_FOUND: 'El campo no existe en este formulario.',
  OPTION_NOT_FOUND: 'La opción guardada ya no está en la lista. Selecciónala a mano.',
  TIMEOUT_CASCADE: 'El portal no cargó las opciones a tiempo. Vuelve a intentarlo.',
  PARENT_FAILED: 'No se pudo porque falló el campo del que depende.',
  NGSELECT_NO_MATCH: 'No se encontró la actividad económica en la lista del portal.',
  NGSELECT_DISABLED: 'El selector de actividad económica está deshabilitado.',
  DOC_FIELD_NOT_RENDERED: 'El campo de número de documento no apareció. Cópialo y pégalo a mano.',
  VALUE_MISMATCH: 'El portal rechazó el valor. Revísalo a mano.',
  EMPTY_VALUE: 'Sin dato guardado.',
  NOT_ELIGIBLE_CCF: 'Este cliente no tiene NIT ni DUI, así que no puede recibir crédito fiscal.',
  EXCEPTION: 'Ocurrió un error inesperado en este campo.',
};

export const ERROR_MESSAGES: Record<string, string> = {
  PAGE_NOT_SUPPORTED: T.wrongPage,
  PAGE_NOT_READY: 'La página todavía no terminó de cargar. Espera un momento y reintenta.',
  RECIPIENT_ROOT_MISSING: 'No se encontró la sección Receptor en esta página.',
  INVALID_PRODUCT: 'Este producto tiene datos inválidos. Edítalo y guárdalo de nuevo.',
  NO_TAB: 'No hay ninguna pestaña activa.',
  TIMEOUT: 'La página no respondió a tiempo.',
  UNKNOWN: 'Ocurrió un error inesperado.',
};

const FIELD_LABELS: Record<FieldKey, string> = {
  docType: 'Tipo de documento',
  docNumber: 'Número de documento',
  nit: 'NIT',
  name: 'Nombre',
  tradeName: 'Nombre comercial',
  nrc: 'NRC',
  activity: 'Actividad económica',
  activityDescription: 'Descripción de la actividad',
  department: 'Departamento',
  municipality: 'Municipio',
  district: 'Distrito',
  details: 'Complemento',
  email: 'Correo',
  phone: 'Teléfono',
  itemType: 'Tipo',
  quantity: 'Cantidad',
  unit: 'Unidad',
  code: 'Código',
  description: 'Producto',
  saleType: 'Tipo de venta',
  price: 'Precio',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key as FieldKey] ?? key;
}
