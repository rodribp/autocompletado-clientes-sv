// Runs in a tab, not the popup: the file picker closes the popup and the
// <input type="file"> `change` event never arrives.

import { T } from '../common/i18n.js';
import { DOC_TYPES } from '../common/types.js';
import { formatDocNumber } from '../common/normalize.js';
import { applyImport, planImport, type ImportPlan } from '../common/storage.js';
import type { Customer } from '../common/types.js';

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

  if (plan.valid.length === 0) {
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

  $('file-name').textContent = `${file.name} — ${plan.valid.length} ${
    plan.valid.length === 1 ? 'cliente' : 'clientes'
  } en el archivo.`;

  $('n-added').textContent = String(plan.added.length);
  $('n-updated').textContent = String(plan.collisions.length);
  $('n-skipped').textContent = String(plan.skipped);
  $('li-skipped').hidden = plan.skipped === 0;

  const details = $('preview-details');
  details.replaceChildren();

  if (plan.added.length > 0) {
    details.append(
      listBlock(
        `Se agregarían (${plan.added.length})`,
        plan.added.map((c) => row(c)),
        plan.collisions.length === 0,
      ),
    );
  }

  if (plan.collisions.length > 0) {
    details.append(
      listBlock(
        `Se sobrescribirían (${plan.collisions.length})`,
        plan.collisions.map(({ incoming, existing }) => collisionRow(incoming, existing)),
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

  if (mode() === 'merge') {
    warn.hidden = true;
    confirm.textContent =
      plan.collisions.length > 0
        ? `Importar ${plan.added.length} y actualizar ${plan.collisions.length}`
        : `Importar ${plan.added.length} ${plan.added.length === 1 ? 'cliente' : 'clientes'}`;
    return;
  }

  const lost = plan.existingTotal - plan.collisions.length;
  warn.hidden = false;
  warn.textContent =
    lost > 0
      ? `Se borrarán ${lost} ${lost === 1 ? 'cliente que tienes guardado y que no está' : 'clientes que tienes guardados y que no están'} en este archivo. No se puede deshacer.`
      : 'Tus clientes actuales están todos en el archivo, así que no se perderá ninguno.';
  confirm.textContent = `Reemplazar todo por ${plan.valid.length} ${
    plan.valid.length === 1 ? 'cliente' : 'clientes'
  }`;
}

async function confirmImport(): Promise<void> {
  if (!plan) return;

  const confirm = $<HTMLButtonElement>('btn-confirm');
  const cancel = $<HTMLButtonElement>('btn-cancel');
  confirm.disabled = true;
  cancel.disabled = true;

  try {
    const report = await applyImport(plan.valid, plan.skipped, mode());
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

function row(customer: Customer): HTMLLIElement {
  const li = document.createElement('li');
  li.append(customer.name, ' ', doc(customer));
  return li;
}

function collisionRow(incoming: Customer, existing: Customer): HTMLLIElement {
  const li = document.createElement('li');

  if (existing.name !== incoming.name) {
    const before = document.createElement('span');
    before.className = 'overwritten';
    before.textContent = existing.name;

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';

    li.append(before, arrow);
  }

  li.append(incoming.name, ' ', doc(incoming));
  return li;
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
