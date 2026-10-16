// Runs in a tab, not the popup: the file picker closes the popup and the
// <input type="file"> `change` event never arrives.

import { T } from '../common/i18n.js';
import { DOC_TYPES, SALE_TYPES, type Customer, type Product } from '../common/types.js';
import { formatDocNumber, formatPrice } from '../common/normalize.js';
import { applyImport, planImport, type ImportPlan } from '../common/storage.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let plan: ImportPlan | null = null;

function main(): void {
  const file = $<HTMLInputElement>('file');

  $('btn-choose').addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    if (chosen) void loadFile(chosen);
  });

  wireDropZone();

  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
    radio.addEventListener('change', renderModeWarning);
  }

  $('btn-confirm').addEventListener('click', () => void confirmImport());
  $('btn-cancel').addEventListener('click', () => reset());
  $('btn-another').addEventListener('click', () => reset());
  $('btn-close').addEventListener('click', () => window.close());
}

function wireDropZone(): void {
  const zone = $('dropzone');

  for (const type of ['dragenter', 'dragover'] as const) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.add('dragover');
    });
  }

  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('dragover');
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) void loadFile(dropped);
  });

  // Otherwise the browser would open the JSON when dropped outside the zone.
  document.addEventListener('dragover', (event) => event.preventDefault());
  document.addEventListener('drop', (event) => event.preventDefault());
}

async function loadFile(file: File): Promise<void> {
  showError(null);

  try {
    plan = await planImport(await readText(file));
  } catch (error) {
    plan = null;
    showError(error instanceof Error ? error.message : String(error));
    return;
  }

  if (plan.valid.length === 0 && !plan.products?.length) {
    const detail =
      plan.skipped > 0
        ? `El archivo tiene ${plan.skipped} ${plan.skipped === 1 ? 'registro' : 'registros'}, pero ninguno es un cliente completo.`
        : 'El archivo no tiene ningún cliente.';
    plan = null;
    showError(`No hay nada que importar. ${detail}`);
    return;
  }

  renderPreview(file);
  showStep('step-preview');
}

function renderPreview(file: File): void {
  if (!plan) return;

  const products = plan.products?.length ?? 0;
  $('file-name').textContent =
    `${file.name} — ${plan.valid.length} ${plan.valid.length === 1 ? 'cliente' : 'clientes'}` +
    (products > 0 ? ` y ${products} ${products === 1 ? 'producto' : 'productos'}` : '') +
    ' en el archivo.';

  $('n-added').textContent = String(plan.added.length);
  $('n-updated').textContent = String(plan.collisions.length);
  $('n-skipped').textContent = String(plan.skipped);
  $('li-skipped').hidden = plan.skipped === 0;

  const details = $('preview-details');
  details.replaceChildren();

  if (plan.added.length > 0) {
    details.append(
      listBlock(
        `Clientes que se agregarían (${plan.added.length})`,
        plan.added.map((c) => row(c.name, doc(c))),
        plan.collisions.length === 0,
      ),
    );
  }

  if (plan.collisions.length > 0) {
    details.append(
      listBlock(
        `Clientes que se sobrescribirían (${plan.collisions.length})`,
        plan.collisions.map(({ incoming, existing }) => row(incoming.name, doc(incoming), existing.name)),
        true,
      ),
    );
  }

  if (plan.productsAdded.length > 0) {
    details.append(
      listBlock(
        `Productos que se agregarían (${plan.productsAdded.length})`,
        plan.productsAdded.map((p) => row(p.description, price(p))),
        plan.productCollisions.length === 0,
      ),
    );
  }

  if (plan.productCollisions.length > 0) {
    details.append(
      listBlock(
        `Productos que se sobrescribirían (${plan.productCollisions.length})`,
        plan.productCollisions.map(({ incoming, existing }) =>
          row(incoming.description, price(incoming, existing), existing.description),
        ),
        true,
      ),
    );
  }

  renderModeWarning();
}

/** Replace deletes whatever isn't in the file, so say how much. */
function renderModeWarning(): void {
  const warn = $('replace-warning');
  const confirm = $<HTMLButtonElement>('btn-confirm');

  if (!plan) return;

  const products = plan.products?.length ?? 0;
  const andProducts = products > 0 ? ` y ${plural(products, 'producto', 'productos')}` : '';

  if (mode() === 'merge') {
    warn.hidden = true;
    confirm.textContent =
      (plan.collisions.length > 0
        ? `Importar ${plan.added.length} y actualizar ${plan.collisions.length}`
        : `Importar ${plural(plan.added.length, 'cliente', 'clientes')}`) + andProducts;
    return;
  }

  // A backup without products leaves them alone, so only count losses when it has them.
  const lostCustomers = plan.existingTotal - plan.collisions.length;
  const lostProducts = plan.products ? plan.existingProducts - plan.productCollisions.length : 0;
  const lost = [
    lostCustomers > 0 ? plural(lostCustomers, 'cliente', 'clientes') : '',
    lostProducts > 0 ? plural(lostProducts, 'producto', 'productos') : '',
  ].filter(Boolean);
  const one = lostCustomers + lostProducts === 1;

  warn.hidden = false;
  warn.textContent =
    lost.length > 0
      ? `${one ? 'Se borrará' : 'Se borrarán'} ${lost.join(' y ')} que ${
          one ? 'tienes guardado y que no está' : 'tienes guardados y que no están'
        } en este archivo. No se puede deshacer.`
      : 'Todo lo que tienes guardado está en el archivo, así que no se perderá nada.';
  confirm.textContent = `Reemplazar todo por ${plural(plan.valid.length, 'cliente', 'clientes')}${andProducts}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

async function confirmImport(): Promise<void> {
  if (!plan) return;

  const confirm = $<HTMLButtonElement>('btn-confirm');
  const cancel = $<HTMLButtonElement>('btn-cancel');
  confirm.disabled = true;
  cancel.disabled = true;

  try {
    const report = await applyImport(plan.valid, plan.skipped, mode(), plan.products);
    $('report').textContent = `Listo. ${T.importedOk(report)}`;
    showStep('step-done');
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    confirm.disabled = false;
    cancel.disabled = false;
  }
}

function reset(): void {
  plan = null;
  $<HTMLInputElement>('file').value = '';
  showError(null);
  showStep('step-choose');
}

function listBlock(title: string, items: HTMLLIElement[], open: boolean): HTMLDetailsElement {
  const block = document.createElement('details');
  block.open = open;

  const summary = document.createElement('summary');
  summary.textContent = title;

  const list = document.createElement('ul');
  list.append(...items);

  block.append(summary, list);
  return block;
}

/** `previous`: the stored name a collision would overwrite. */
function row(name: string, detail: HTMLElement, previous?: string): HTMLLIElement {
  const li = document.createElement('li');

  if (previous !== undefined && previous !== name) {
    const before = document.createElement('span');
    before.className = 'overwritten';
    before.textContent = previous;

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';

    li.append(before, arrow);
  }

  li.append(name, ' ', detail);
  return li;
}

// An overwrite that changes the price is the one worth noticing, so show both.
function price(product: Product, existing?: Product): HTMLElement {
  const span = document.createElement('span');
  span.className = 'doc';
  const now = formatPrice(product.price);
  const changed = existing && existing.price !== product.price;
  span.textContent =
    (changed ? `${formatPrice(existing.price)} → ${now}` : now) +
    (product.saleType === 'G' ? '' : ` · ${SALE_TYPES[product.saleType]}`);
  return span;
}

function doc(customer: Customer): HTMLElement {
  const span = document.createElement('span');
  span.className = 'doc';
  span.textContent = customer.docNumber
    ? `${DOC_TYPES[customer.docType]} ${formatDocNumber(customer.docType, customer.docNumber)}`
    : DOC_TYPES[customer.docType];
  return span;
}

function mode(): 'merge' | 'replace' {
  const checked = document.querySelector<HTMLInputElement>('input[name="mode"]:checked');
  return checked?.value === 'replace' ? 'replace' : 'merge';
}

function showStep(id: 'step-choose' | 'step-preview' | 'step-done'): void {
  for (const step of ['step-choose', 'step-preview', 'step-done'] as const) {
    $(step).hidden = step !== id;
  }
}

function showError(message: string | null): void {
  const banner = $('error');
  banner.hidden = message === null;
  banner.textContent = message ?? '';
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsText(file);
  });
}

main();
