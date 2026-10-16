// `local`, not `sync`: the 100 KB `sync` quota can't even hold 200 customers.

import { foldForSearch, parseDigits } from './normalize.js';
import { looksLikeCustomer, looksLikeProduct } from './validate.js';
import {
  SCHEMA_VERSION,
  emptyDb,
  emptyAddress,
  emptyProductsDb,
  isSaleType,
  isUnit,
  type Customer,
  type CustomerDraft,
  type CustomersDb,
  type Product,
  type ProductDraft,
  type ProductsDb,
} from './types.js';

const DB_KEY = 'db';
// Its own key: customer migrations never have to know about products.
const PRODUCTS_KEY = 'products';

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

interface Stored {
  id: string;
  createdAt: number;
  updatedAt: number;
}

function upsert<T extends Stored>(list: T[], draft: Omit<T, keyof Stored> & Partial<Stored>): T {
  const now = Date.now();
  const existingIndex = draft.id ? list.findIndex((x) => x.id === draft.id) : -1;

  if (existingIndex >= 0) {
    const previous = list[existingIndex]!;
    const updated = { ...previous, ...draft, id: previous.id, createdAt: previous.createdAt, updatedAt: now } as T;
    list[existingIndex] = updated;
    return updated;
  }

  const created = { ...draft, id: draft.id || crypto.randomUUID(), createdAt: now, updatedAt: now } as T;
  list.push(created);
  return created;
}

export async function saveCustomer(draft: CustomerDraft): Promise<Customer> {
  return serialize(async () => {
    const db = await readDb();
    const saved = upsert(db.customers, draft);
    await writeDb(db);
    return saved;
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

function migrateProducts(raw: unknown): ProductsDb {
  const list = (raw as Partial<ProductsDb> | undefined)?.products;
  if (!Array.isArray(list)) return emptyProductsDb();
  return { schemaVersion: SCHEMA_VERSION, products: list.filter(looksLikeProduct).map(fixUpProduct) };
}

function fixUpProduct(p: Product): Product {
  return {
    ...p,
    id: p.id || crypto.randomUUID(),
    unit: isUnit(p.unit) ? p.unit : '59',
    saleType: isSaleType(p.saleType) ? p.saleType : 'G',
    createdAt: p.createdAt ?? Date.now(),
    updatedAt: p.updatedAt ?? Date.now(),
  };
}

export async function readProducts(): Promise<ProductsDb> {
  return migrateProducts(await rawGet(PRODUCTS_KEY));
}

async function writeProducts(db: ProductsDb): Promise<void> {
  await chrome.storage.local.set({ [PRODUCTS_KEY]: db });
}

export async function listProducts(): Promise<Product[]> {
  const { products } = await readProducts();
  return products.sort((a, b) => a.description.localeCompare(b.description, 'es', { sensitivity: 'base' }));
}

export async function saveProduct(draft: ProductDraft): Promise<Product> {
  return serialize(async () => {
    const db = await readProducts();
    const saved = upsert(db.products, draft);
    await writeProducts(db);
    return saved;
  });
}

export async function deleteProduct(id: string): Promise<void> {
  return serialize(async () => {
    const db = await readProducts();
    db.products = db.products.filter((p) => p.id !== id);
    await writeProducts(db);
  });
}

// Pure and synchronous: runs on every keystroke.
export function searchProducts(all: Product[], query: string): Product[] {
  const q = foldForSearch(query).trim();
  if (!q) return all;
  return all.filter((p) => foldForSearch([p.description, p.code, p.notes].filter(Boolean).join(' ')).includes(q));
}

export interface ExportFile {
  format: 'autocompletado-clientes-sv';
  schemaVersion: number;
  exportedAt: string;
  customers: Customer[];
  products: Product[];
}

export async function exportJson(): Promise<string> {
  const [db, { products }] = await Promise.all([readDb(), readProducts()]);
  const payload: ExportFile = {
    format: 'autocompletado-clientes-sv',
    schemaVersion: db.schemaVersion,
    exportedAt: new Date().toISOString(),
    customers: db.customers,
    products,
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportReport {
  imported: number;
  updated: number;
  skipped: number;
  products: number;
}

// Preview step: overwriting hundreds of customers shouldn't be a blind click.
export interface ImportPlan {
  valid: Customer[];
  skipped: number;
  added: Customer[];
  collisions: Array<{ incoming: Customer; existing: Customer }>;
  existingTotal: number;
  /** `null`: the backup predates products, so stored products are left alone. */
  products: Product[] | null;
  productsAdded: Product[];
  productCollisions: Array<{ incoming: Product; existing: Product }>;
  existingProducts: number;
}

// Invalid entries are skipped and counted so one corrupt record doesn't sink the rest.
function parseBackup(text: string): { valid: Customer[]; skipped: number; products: Product[] | null } {
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

  const productsRaw = Array.isArray(parsed) ? undefined : (parsed as Partial<ExportFile>).products;
  const products = Array.isArray(productsRaw) ? migrateProducts({ products: productsRaw }).products : null;

  return { valid, skipped, products };
}

function splitById<T extends { id: string }>(incoming: T[], stored: T[]) {
  const byId = new Map(stored.map((x) => [x.id, x]));
  const added: T[] = [];
  const collisions: Array<{ incoming: T; existing: T }> = [];
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (existing) collisions.push({ incoming: item, existing });
    else added.push(item);
  }
  return { added, collisions };
}

export async function planImport(text: string): Promise<ImportPlan> {
  const { valid, skipped, products } = parseBackup(text);
  const [{ customers }, { products: storedProducts }] = await Promise.all([readDb(), readProducts()]);
  const { added, collisions } = splitById(valid, customers);
  const productSplit = splitById(products ?? [], storedProducts);

  return {
    valid,
    skipped,
    added,
    collisions,
    existingTotal: customers.length,
    products,
    productsAdded: productSplit.added,
    productCollisions: productSplit.collisions,
    existingProducts: storedProducts.length,
  };
}

// Recounts against storage: the popup may have saved something after the preview.
export async function applyImport(
  valid: Customer[],
  skipped: number,
  mode: 'merge' | 'replace',
  products: Product[] | null = null,
): Promise<ImportReport> {
  return serialize(async () => {
    const db = mode === 'replace' ? emptyDb() : await readDb();
    const byId = new Map(db.customers.map((c) => [c.id, c]));
    const report: ImportReport = { imported: 0, updated: 0, skipped, products: products?.length ?? 0 };

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

    if (!products) {
      await writeDb(db);
      return report;
    }

    const productsDb = mode === 'replace' ? emptyProductsDb() : await readProducts();
    const productsById = new Map(productsDb.products.map((p) => [p.id, p]));
    for (const incoming of products) productsById.set(incoming.id, incoming);
    productsDb.products = [...productsById.values()];

    // One `set` for both keys, so a failure can't leave half a backup applied.
    await chrome.storage.local.set({ [DB_KEY]: db, [PRODUCTS_KEY]: productsDb });
    return report;
  });
}

export async function importJson(text: string, mode: 'merge' | 'replace'): Promise<ImportReport> {
  const { valid, skipped, products } = parseBackup(text);
  return applyImport(valid, skipped, mode, products);
}
