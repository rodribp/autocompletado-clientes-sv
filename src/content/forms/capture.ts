// SPDX-License-Identifier: MIT
//
// «Guardar cliente actual»: leer el receptor en pantalla y proponerlo como
// cliente nuevo. Es la vía de migración desde el Excel: en vez de teclear
// códigos que el portal no publica, se toman los que él acaba de usar.

import { canonDocNumber, parseActividadLabel, parseDigits, squish } from '../../common/normalize.js';
import { emptyDireccion, isDocType, type Customer, type DocType } from '../../common/types.js';
import type { CatalogDelta } from '../../common/catalog.js';
import { distritoKey, type CatalogEntry } from '../../common/catalog.js';
import type { CaptureResult, FieldKey, FormType } from '../../common/messages.js';
import { q, receptorRoot } from './detect.js';

/** El `value` que Angular pone en la opción de marcador de posición. */
const ANGULAR_PLACEHOLDER = /^\d+:\s/;

function selectValue(root: HTMLElement, control: string): { codigo: string; nombre: string } | null {
  const el = q<HTMLSelectElement>(root, control);
  if (!el) return null;

  const value = el.value?.trim() ?? '';
  if (!value || ANGULAR_PLACEHOLDER.test(value)) return null;

  const text = el.selectedOptions[0]?.textContent?.trim() ?? '';
  // Las etiquetas vienen como «06 - SAN SALVADOR»; nos quedamos con el nombre.
  const nombre = text.replace(/^\s*\S+\s*-\s*/, '').trim() || text;
  return { codigo: value, nombre };
}

function textValue(root: HTMLElement, control: string): string {
  const el = q<HTMLInputElement | HTMLTextAreaElement>(root, control);
  return squish(el?.value ?? '');
}

export function captureReceptor(formType: FormType): CaptureResult {
  const root = receptorRoot(formType);
  if (!root) return { draft: {}, missing: [] };

  const missing: FieldKey[] = [];
  const draft: Partial<Customer> = { direccion: emptyDireccion() };

  const note = (key: FieldKey, value: string) => {
    if (!value) missing.push(key);
    return value;
  };

  draft.nombre = note('nombre', textValue(root, 'nombre'));
  draft.nrc = note('nrc', parseDigits(textValue(root, 'nrc')));

  if (formType === 'ccf') {
    const nit = parseDigits(textValue(root, 'nit'));
    draft.docNumber = note('nit', nit);
    // El CCF no pregunta el tipo, así que lo deducimos de la longitud: 14 es
    // un NIT clásico, 9 es un DUI haciendo de NIT.
    draft.docType = nit.length === 14 ? '36' : nit.length === 9 ? '13' : '36';
    draft.nombreComercial = textValue(root, 'nombreComercial');
    draft.correo = textValue(root, 'correo');
    draft.telefono = parseDigits(textValue(root, 'telefono'));
  } else {
    const tipo = q<HTMLSelectElement>(root, 'tipoDocumento')?.value?.trim() ?? '';
    const docType: DocType = isDocType(tipo) ? tipo : '36';
    draft.docType = docType;
    draft.docNumber = note('docNumber', canonDocNumber(docType, readCfDocNumber(root)));
    draft.correo = textValue(root, 'correoReceptor');
    draft.telefono = parseDigits(textValue(root, 'telefonoReceptor'));
  }

  const actividad = readActividad(root, formType);
  if (actividad) draft.actividad = actividad;
  else missing.push('actividad');

  const departamento = selectValue(root, 'departamento');
  const municipio = selectValue(root, 'municipio');
  const distrito = selectValue(root, 'distrito');

  draft.direccion = {
    departamento: departamento?.codigo ?? '',
    municipio: municipio?.codigo ?? '',
    distrito: distrito?.codigo ?? '',
    complemento: textValue(root, 'complemento'),
  };
  if (municipio) draft.direccion.municipioNombre = municipio.nombre;
  if (distrito) draft.direccion.distritoNombre = distrito.nombre;

  if (!departamento) missing.push('departamento');
  if (!municipio) missing.push('municipio');
  if (!distrito) missing.push('distrito');

  return { draft, missing };
}

/** En CF el input del número no tiene un nombre fijo: lo buscamos por descarte. */
function readCfDocNumber(root: HTMLElement): string {
  const tipo = q<HTMLSelectElement>(root, 'tipoDocumento');
  const row = tipo?.closest('div.form-group.row');
  const input = row?.querySelector<HTMLInputElement>('input:not([hidden])');
  return input?.value ?? '';
}

/** Sale del ng-select; si no hay etiqueta, queda el input oculto `descActividad`. */
function readActividad(root: HTMLElement, formType: FormType): { codigo: string; descripcion: string } | null {
  const control = formType === 'ccf' ? 'actividadEconomica' : 'codActividad';
  const host = q<HTMLElement>(root, control);
  const label = host?.querySelector('.ng-value-label')?.textContent?.trim() ?? '';

  const parsed = label ? parseActividadLabel(label) : null;
  if (parsed) return parsed;

  const descripcion = textValue(root, 'descActividad');
  return descripcion ? { codigo: '', descripcion } : null;
}

/**
 * Cosecha los municipios y distritos que el portal tenga pintados. Corre al
 * capturar y al rellenar: cada documento enriquece el catálogo local.
 */
export function harvestCatalog(formType: FormType): CatalogDelta {
  const root = receptorRoot(formType);
  if (!root) return {};

  const departamento = q<HTMLSelectElement>(root, 'departamento')?.value?.trim() ?? '';
  if (!departamento || ANGULAR_PLACEHOLDER.test(departamento)) return {};

  const delta: CatalogDelta = { municipios: {}, distritos: {} };

  const municipios = readOptions(root, 'municipio');
  if (municipios.length > 0) delta.municipios![departamento] = municipios;

  const municipio = q<HTMLSelectElement>(root, 'municipio')?.value?.trim() ?? '';
  if (municipio && !ANGULAR_PLACEHOLDER.test(municipio)) {
    const distritos = readOptions(root, 'distrito');
    if (distritos.length > 0) delta.distritos![distritoKey(departamento, municipio)] = distritos;
  }

  return delta;
}

function readOptions(root: HTMLElement, control: string): CatalogEntry[] {
  const el = q<HTMLSelectElement>(root, control);
  if (!el) return [];

  return [...el.options]
    .map((option) => {
      const codigo = option.value.trim();
      // Ojo con los espacios: en CCF las etiquetas de distrito los llevan al
      // principio y al final.
      const text = (option.textContent ?? '').trim();
      const nombre = text.replace(/^\s*\S+\s*-\s*/, '').trim() || text;
      return { codigo, nombre };
    })
    .filter((entry) => entry.codigo !== '' && !ANGULAR_PLACEHOLDER.test(entry.codigo));
}
