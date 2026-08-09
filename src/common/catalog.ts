// SPDX-License-Identifier: MIT
//
// Catálogo territorial.
//
// El portal no publica ninguno que podamos leer. Los 15 departamentos están en
// su plantilla y van fijos aquí; municipios y distritos se **aprenden**,
// cosechando las opciones cada vez que rellenamos o capturamos un receptor. Tras
// unos pocos documentos el popup ya ofrece desplegables en vez de pedir códigos.

export interface CatalogEntry {
  codigo: string;
  nombre: string;
}

/** `catalog[departamento].municipios` y `catalog[dep][mun].distritos`. */
export interface Catalog {
  /** codigo de departamento → municipios conocidos */
  municipios: Record<string, CatalogEntry[]>;
  /** `${departamento}/${municipio}` → distritos conocidos */
  distritos: Record<string, CatalogEntry[]>;
}

export type CatalogDelta = Partial<Catalog>;

const CATALOG_KEY = 'catalog';

/** Los 15 departamentos del portal; `00` es para receptores extranjeros. */
export const DEPARTAMENTOS: CatalogEntry[] = [
  { codigo: '00', nombre: 'Otro (para extranjeros)' },
  { codigo: '01', nombre: 'Ahuachapán' },
  { codigo: '02', nombre: 'Santa Ana' },
  { codigo: '03', nombre: 'Sonsonate' },
  { codigo: '04', nombre: 'Chalatenango' },
  { codigo: '05', nombre: 'La Libertad' },
  { codigo: '06', nombre: 'San Salvador' },
  { codigo: '07', nombre: 'Cuscatlán' },
  { codigo: '08', nombre: 'La Paz' },
  { codigo: '09', nombre: 'Cabañas' },
  { codigo: '10', nombre: 'San Vicente' },
  { codigo: '11', nombre: 'Usulután' },
  { codigo: '12', nombre: 'San Miguel' },
  { codigo: '13', nombre: 'Morazán' },
  { codigo: '14', nombre: 'La Unión' },
];

export function departamentoNombre(codigo: string): string {
  return DEPARTAMENTOS.find((d) => d.codigo === codigo)?.nombre ?? codigo;
}

export function distritoKey(departamento: string, municipio: string): string {
  return `${departamento}/${municipio}`;
}

export function emptyCatalog(): Catalog {
  return { municipios: {}, distritos: {} };
}

export async function readCatalog(): Promise<Catalog> {
  const bag = await chrome.storage.local.get(CATALOG_KEY);
  const raw = bag[CATALOG_KEY] as Partial<Catalog> | undefined;
  return {
    municipios: raw?.municipios ?? {},
    distritos: raw?.distritos ?? {},
  };
}

/** El portal manda, pero una lista vacía nunca borra a una conocida. */
export async function mergeCatalog(delta: CatalogDelta): Promise<Catalog> {
  const current = await readCatalog();

  for (const [key, entries] of Object.entries(delta.municipios ?? {})) {
    if (entries.length > 0) current.municipios[key] = entries;
  }
  for (const [key, entries] of Object.entries(delta.distritos ?? {})) {
    if (entries.length > 0) current.distritos[key] = entries;
  }

  await chrome.storage.local.set({ [CATALOG_KEY]: current });
  return current;
}
