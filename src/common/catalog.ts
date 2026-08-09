// The portal publishes no catalog: municipalities and districts are learned from its options on fill or capture.

export interface CatalogEntry {
  code: string;
  name: string;
}

export interface Catalog {
  /** Key: department code. */
  municipalities: Record<string, CatalogEntry[]>;
  /** Key: `districtKey(department, municipality)`. */
  districts: Record<string, CatalogEntry[]>;
}

export type CatalogDelta = Partial<Catalog>;

const CATALOG_KEY = 'catalog';

export const DEPARTMENTS: CatalogEntry[] = [
  { code: '00', name: 'Otro (para extranjeros)' },
  { code: '01', name: 'Ahuachapán' },
  { code: '02', name: 'Santa Ana' },
  { code: '03', name: 'Sonsonate' },
  { code: '04', name: 'Chalatenango' },
  { code: '05', name: 'La Libertad' },
  { code: '06', name: 'San Salvador' },
  { code: '07', name: 'Cuscatlán' },
  { code: '08', name: 'La Paz' },
  { code: '09', name: 'Cabañas' },
  { code: '10', name: 'San Vicente' },
  { code: '11', name: 'Usulután' },
  { code: '12', name: 'San Miguel' },
  { code: '13', name: 'Morazán' },
  { code: '14', name: 'La Unión' },
];

export function departmentName(code: string): string {
  return DEPARTMENTS.find((d) => d.code === code)?.name ?? code;
}

export function districtKey(department: string, municipality: string): string {
  return `${department}/${municipality}`;
}

export function emptyCatalog(): Catalog {
  return { municipalities: {}, districts: {} };
}

export async function readCatalog(): Promise<Catalog> {
  const bag = await chrome.storage.local.get(CATALOG_KEY);
  const raw = bag[CATALOG_KEY] as Partial<Catalog> | undefined;
  return {
    municipalities: raw?.municipalities ?? {},
    districts: raw?.districts ?? {},
  };
}

/** The portal wins, but an empty list never erases a known one. */
export async function mergeCatalog(delta: CatalogDelta): Promise<Catalog> {
  const current = await readCatalog();

  for (const [key, entries] of Object.entries(delta.municipalities ?? {})) {
    if (entries.length > 0) current.municipalities[key] = entries;
  }
  for (const [key, entries] of Object.entries(delta.districts ?? {})) {
    if (entries.length > 0) current.districts[key] = entries;
  }

  await chrome.storage.local.set({ [CATALOG_KEY]: current });
  return current;
}
