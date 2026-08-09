// SPDX-License-Identifier: MIT
//
// Persistencia sobre `chrome.storage.local`.
//
// `local` y no `sync` porque `sync` da 102 400 bytes totales y 120 escrituras
// por minuto: con ~400 bytes por cliente, el tope rondaría los 200 e importar
// un respaldo reventaría la cuota. Entre máquinas se pasa por JSON.

import { foldForSearch, parseDigits } from './normalize.js';
import { looksLikeCustomer } from './validate.js';
import {
  SCHEMA_VERSION,
  emptyDb,
  emptyDireccion,
  type Customer,
  type CustomerDraft,
  type CustomersDb,
} from './types.js';

const DB_KEY = 'db';

/**
 * Serializa los ciclos leer-modificar-escribir: sin esto, dos acciones seguidas
 * leerían el mismo estado y la segunda perdería a la primera.
 */
let writeChain: Promise<unknown> = Promise.resolve();

function serialize<T>(op: () => Promise<T>): Promise<T> {
  const next = writeChain.then(op, op);
  // La cadena no debe romperse si una operación falla.
  writeChain = next.catch(() => undefined);
  return next;
}

async function rawGet(key: string): Promise<unknown> {
  const bag = await chrome.storage.local.get(key);
  return bag[key];
}

/** Normaliza lo que haya en disco, tolerando el array pelado y el `{}` heredados. */
export function migrate(raw: unknown): CustomersDb {
  if (Array.isArray(raw)) {
    return { schemaVersion: SCHEMA_VERSION, customers: raw.filter(looksLikeCustomer).map(fixUp) };
  }

  if (typeof raw !== 'object' || raw === null) return emptyDb();

  const obj = raw as Partial<CustomersDb>;
  if (!Array.isArray(obj.customers)) return emptyDb();

  const version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    // Datos de una versión más nueva: mostrarlos tal cual, vaciarlos los perdería.
    console.warn(
      `[clientes] Los datos son de un esquema más nuevo (v${version} > v${SCHEMA_VERSION}). Actualiza la extensión.`,
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    customers: obj.customers.filter(looksLikeCustomer).map(fixUp),
  };
}

/** Rellena campos que pudieran faltar en registros viejos o importados. */
function fixUp(c: Customer): Customer {
  return {
    ...c,
    id: c.id || crypto.randomUUID(),
    direccion: { ...emptyDireccion(), ...(c.direccion ?? {}) },
    createdAt: c.createdAt ?? Date.now(),
    updatedAt: c.updatedAt ?? Date.now(),
  };
}

export async function readDb(): Promise<CustomersDb> {
  return migrate(await rawGet(DB_KEY));
}

async function writeDb(db: CustomersDb): Promise<void> {
  await chrome.storage.local.set({ [DB_KEY]: db });
}

/** Todos los clientes, ordenados por nombre con las reglas del español. */
export async function listCustomers(): Promise<Customer[]> {
  const { customers } = await readDb();
  return customers.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  const { customers } = await readDb();
  return customers.find((c) => c.id === id);
}

/** Alta o modificación, según venga o no un `id` que exista. */
export async function saveCustomer(draft: CustomerDraft): Promise<Customer> {
  return serialize(async () => {
    const db = await readDb();
    const now = Date.now();
    const existingIndex = draft.id ? db.customers.findIndex((c) => c.id === draft.id) : -1;

    if (existingIndex >= 0) {
      const previous = db.customers[existingIndex]!;
      const updated: Customer = { ...previous, ...draft, id: previous.id, createdAt: previous.createdAt, updatedAt: now };
      db.customers[existingIndex] = updated;
      await writeDb(db);
      return updated;
    }

    const created: Customer = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    db.customers.push(created);
    await writeDb(db);
    return created;
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  return serialize(async () => {
    const db = await readDb();
    db.customers = db.customers.filter((c) => c.id !== id);
    await writeDb(db);
  });
}

/**
 * Filtrado en memoria, puro y síncrono para poder llamarlo en cada tecla. Sin
 * acentos en los textos, y por dígitos en documento y NRC, de modo que `0614`
 * y `0614-1201` encuentren al mismo cliente.
 */
export function searchCustomers(all: Customer[], query: string): Customer[] {
  const q = foldForSearch(query).trim();
  if (!q) return all;

  const digits = parseDigits(q);

  return all.filter((c) => {
    const haystack = foldForSearch([c.nombre, c.nombreComercial, c.notas].filter(Boolean).join(' '));
    if (haystack.includes(q)) return true;
    if (digits && (parseDigits(c.docNumber).includes(digits) || parseDigits(c.nrc).includes(digits))) return true;
    return false;
  });
}

// ---------------------------------------------------------------- respaldos

export interface ExportFile {
  formato: 'autocompletado-clientes-sv';
  schemaVersion: number;
  exportadoEn: string;
  customers: Customer[];
}

export async function exportJson(): Promise<string> {
  const db = await readDb();
  const payload: ExportFile = {
    formato: 'autocompletado-clientes-sv',
    schemaVersion: db.schemaVersion,
    exportadoEn: new Date().toISOString(),
    customers: db.customers,
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportReport {
  importados: number;
  actualizados: number;
  omitidos: number;
}

/**
 * Importa un respaldo. Los registros inválidos se omiten y se cuentan: uno
 * corrupto no debe costarle al usuario los otros doscientos.
 */
export async function importJson(text: string, mode: 'merge' | 'replace'): Promise<ImportReport> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es JSON válido.');
  }

  const incomingRaw = Array.isArray(parsed)
    ? parsed
    : ((parsed as Partial<ExportFile>)?.customers ?? null);

  if (!Array.isArray(incomingRaw)) {
    throw new Error('El archivo no parece un respaldo de clientes.');
  }

  const report: ImportReport = { importados: 0, actualizados: 0, omitidos: 0 };
  const valid: Customer[] = [];
  for (const item of incomingRaw) {
    if (looksLikeCustomer(item)) valid.push(fixUp(item));
    else report.omitidos++;
  }

  return serialize(async () => {
    const db = mode === 'replace' ? emptyDb() : await readDb();
    const byId = new Map(db.customers.map((c) => [c.id, c]));

    for (const incoming of valid) {
      if (byId.has(incoming.id)) {
        byId.set(incoming.id, { ...byId.get(incoming.id)!, ...incoming, updatedAt: Date.now() });
        report.actualizados++;
      } else {
        byId.set(incoming.id, incoming);
        report.importados++;
      }
    }

    db.customers = [...byId.values()];
    await writeDb(db);
    return report;
  });
}
