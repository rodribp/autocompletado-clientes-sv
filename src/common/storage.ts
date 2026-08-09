// `local`, not `sync`: the 100 KB `sync` quota can't even hold 200 customers.

import { foldForSearch, parseDigits } from './normalize.js';
import { looksLikeCustomer } from './validate.js';
import {
  SCHEMA_VERSION,
  emptyDb,
  emptyAddress,
  type Customer,
  type CustomerDraft,
  type CustomersDb,
} from './types.js';

const DB_KEY = 'db';

// Serializes read-modify-write so back-to-back writes don't clobber each other.
let writeChain: Promise<unknown> = Promise.resolve();

function serialize<T>(op: () => Promise<T>): Promise<T> {
  const next = writeChain.then(op, op);
  // Keep the chain alive even if an operation fails.
  writeChain = next.catch(() => undefined);
  return next;
}

async function rawGet(key: string): Promise<unknown> {
  const bag = await chrome.storage.local.get(key);
  return bag[key];
}

// Accepts legacy formats: a bare array and `{}`.
export function migrate(raw: unknown): CustomersDb {
  if (Array.isArray(raw)) {
    return { schemaVersion: SCHEMA_VERSION, customers: raw.filter(looksLikeCustomer).map(fixUp) };
  }

  if (typeof raw !== 'object' || raw === null) return emptyDb();

  const obj = raw as Partial<CustomersDb>;
  if (!Array.isArray(obj.customers)) return emptyDb();

  const version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    // Data from a newer version: keep it as is; resetting would lose it.
    console.warn(
      `[clientes] Data comes from a newer schema (v${version} > v${SCHEMA_VERSION}). Update the extension.`,
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    customers: obj.customers.filter(looksLikeCustomer).map(fixUp),
  };
}

function fixUp(c: Customer): Customer {
  return {
    ...c,
    id: c.id || crypto.randomUUID(),
    address: { ...emptyAddress(), ...(c.address ?? {}) },
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

export async function listCustomers(): Promise<Customer[]> {
  const { customers } = await readDb();
  return customers.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  const { customers } = await readDb();
  return customers.find((c) => c.id === id);
}

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

// Pure and synchronous: runs on every keystroke.
export function searchCustomers(all: Customer[], query: string): Customer[] {
  const q = foldForSearch(query).trim();
  if (!q) return all;

  const digits = parseDigits(q);

  return all.filter((c) => {
    const haystack = foldForSearch([c.name, c.tradeName, c.notes].filter(Boolean).join(' '));
    if (haystack.includes(q)) return true;
    if (digits && (parseDigits(c.docNumber).includes(digits) || parseDigits(c.nrc).includes(digits))) return true;
    return false;
  });
}

export interface ExportFile {
  format: 'autocompletado-clientes-sv';
  schemaVersion: number;
  exportedAt: string;
  customers: Customer[];
}

export async function exportJson(): Promise<string> {
  const db = await readDb();
  const payload: ExportFile = {
    format: 'autocompletado-clientes-sv',
    schemaVersion: db.schemaVersion,
    exportedAt: new Date().toISOString(),
    customers: db.customers,
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportReport {
  imported: number;
  updated: number;
  skipped: number;
}

// Preview step: overwriting hundreds of customers shouldn't be a blind click.
export interface ImportPlan {
  valid: Customer[];
  skipped: number;
  added: Customer[];
  collisions: Array<{ incoming: Customer; existing: Customer }>;
  existingTotal: number;
}

// Invalid entries are skipped and counted so one corrupt record doesn't sink the rest.
function parseBackup(text: string): { valid: Customer[]; skipped: number } {
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

  const valid: Customer[] = [];
  let skipped = 0;
  for (const item of incomingRaw) {
    if (looksLikeCustomer(item)) valid.push(fixUp(item));
    else skipped++;
  }

  return { valid, skipped };
}

export async function planImport(text: string): Promise<ImportPlan> {
  const { valid, skipped } = parseBackup(text);
  const { customers } = await readDb();
  const byId = new Map(customers.map((c) => [c.id, c]));

  const added: Customer[] = [];
  const collisions: ImportPlan['collisions'] = [];
  for (const incoming of valid) {
    const existing = byId.get(incoming.id);
    if (existing) collisions.push({ incoming, existing });
    else added.push(incoming);
  }

  return { valid, skipped, added, collisions, existingTotal: customers.length };
}

// Recounts against storage: the popup may have saved something after the preview.
export async function applyImport(
  valid: Customer[],
  skipped: number,
  mode: 'merge' | 'replace',
): Promise<ImportReport> {
  return serialize(async () => {
    const db = mode === 'replace' ? emptyDb() : await readDb();
    const byId = new Map(db.customers.map((c) => [c.id, c]));
    const report: ImportReport = { imported: 0, updated: 0, skipped };

    for (const incoming of valid) {
      if (byId.has(incoming.id)) {
        byId.set(incoming.id, { ...byId.get(incoming.id)!, ...incoming, updatedAt: Date.now() });
        report.updated++;
      } else {
        byId.set(incoming.id, incoming);
        report.imported++;
      }
    }

    db.customers = [...byId.values()];
    await writeDb(db);
    return report;
  });
}

export async function importJson(text: string, mode: 'merge' | 'replace'): Promise<ImportReport> {
  const { valid, skipped } = parseBackup(text);
  return applyImport(valid, skipped, mode);
}
