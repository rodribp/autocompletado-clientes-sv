// SPDX-License-Identifier: MIT
//
// Página de importación de respaldos.
//
// Vive en una pestaña y no en el popup por una limitación de Chrome: abrir el
// selector de archivos le quita el foco al popup y el navegador lo cierra, así
// que el `change` del <input type="file"> nunca llega a ejecutarse. En una
// pestaña normal el diálogo se comporta como en cualquier página web.
//
// Estar en una pestaña además da sitio para lo que el popup no tenía: enseñar
// qué va a cambiar y pedir confirmación antes de escribir.

import { T } from '../common/i18n.js';
import { DOC_TYPES } from '../common/types.js';
import { formatDocNumber } from '../common/normalize.js';
import { applyImport, planImport, type ImportPlan } from '../common/storage.js';
import type { Customer } from '../common/types.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** El plan en pantalla, o `null` si todavía no se ha elegido archivo. */
let plan: ImportPlan | null = null;

function main(): void {
  const file = $<HTMLInputElement>('file');

  $('btn-elegir').addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    if (chosen) void loadFile(chosen);
  });

  wireDropZone();

  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="modo"]')) {
    radio.addEventListener('change', renderModeWarning);
  }

  $('btn-confirmar').addEventListener('click', () => void confirmImport());
  $('btn-cancelar').addEventListener('click', () => reset());
  $('btn-otro').addEventListener('click', () => reset());
  $('btn-cerrar').addEventListener('click', () => window.close());
}

/** Arrastrar el archivo evita el diálogo del sistema; funciona igual de bien. */
function wireDropZone(): void {
  const zone = $('zona');

  for (const type of ['dragenter', 'dragover'] as const) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.add('dentro');
    });
  }

  zone.addEventListener('dragleave', () => zone.classList.remove('dentro'));

  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('dentro');
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) void loadFile(dropped);
  });

  // Sin esto el navegador abriría el JSON al soltarlo fuera de la zona.
  document.addEventListener('dragover', (event) => event.preventDefault());
  document.addEventListener('drop', (event) => event.preventDefault());
}

// ------------------------------------------------------------------- pasos

async function loadFile(file: File): Promise<void> {
  showError(null);

  try {
    plan = await planImport(await readText(file));
  } catch (error) {
    plan = null;
    showError(error instanceof Error ? error.message : String(error));
    return;
  }

  if (plan.validos.length === 0) {
    const detalle =
      plan.omitidos > 0
        ? `El archivo tiene ${plan.omitidos} ${plan.omitidos === 1 ? 'registro' : 'registros'}, pero ninguno es un cliente completo.`
        : 'El archivo no tiene ningún cliente.';
    plan = null;
    showError(`No hay nada que importar. ${detalle}`);
    return;
  }

  renderPreview(file);
  showStep('paso-previa');
}

function renderPreview(file: File): void {
  if (!plan) return;

  $('archivo').textContent = `${file.name} — ${plan.validos.length} ${
    plan.validos.length === 1 ? 'cliente' : 'clientes'
  } en el archivo.`;

  $('n-nuevos').textContent = String(plan.nuevos.length);
  $('n-actualizados').textContent = String(plan.colisiones.length);
  $('n-omitidos').textContent = String(plan.omitidos);
  $('li-omitidos').hidden = plan.omitidos === 0;

  const detalle = $('detalle');
  detalle.replaceChildren();

  if (plan.nuevos.length > 0) {
    detalle.append(
      listBlock(
        `Se agregarían (${plan.nuevos.length})`,
        plan.nuevos.map((c) => row(c)),
        plan.colisiones.length === 0,
      ),
    );
  }

  if (plan.colisiones.length > 0) {
    detalle.append(
      listBlock(
        `Se sobrescribirían (${plan.colisiones.length})`,
        plan.colisiones.map(({ entrante, actual }) => collisionRow(entrante, actual)),
        true,
      ),
    );
  }

  renderModeWarning();
}

/** Reemplazar borra lo que no venga en el archivo: hay que decir cuánto. */
function renderModeWarning(): void {
  const warn = $('aviso-replace');
  const confirm = $<HTMLButtonElement>('btn-confirmar');

  if (!plan) return;

  if (mode() === 'merge') {
    warn.hidden = true;
    confirm.textContent =
      plan.colisiones.length > 0
        ? `Importar ${plan.nuevos.length} y actualizar ${plan.colisiones.length}`
        : `Importar ${plan.nuevos.length} ${plan.nuevos.length === 1 ? 'cliente' : 'clientes'}`;
    return;
  }

  const perdidos = plan.totalActual - plan.colisiones.length;
  warn.hidden = false;
  warn.textContent =
    perdidos > 0
      ? `Se borrarán ${perdidos} ${perdidos === 1 ? 'cliente que tienes guardado y que no está' : 'clientes que tienes guardados y que no están'} en este archivo. No se puede deshacer.`
      : 'Tus clientes actuales están todos en el archivo, así que no se perderá ninguno.';
  confirm.textContent = `Reemplazar todo por ${plan.validos.length} ${
    plan.validos.length === 1 ? 'cliente' : 'clientes'
  }`;
}

async function confirmImport(): Promise<void> {
  if (!plan) return;

  const confirm = $<HTMLButtonElement>('btn-confirmar');
  const cancel = $<HTMLButtonElement>('btn-cancelar');
  confirm.disabled = true;
  cancel.disabled = true;

  try {
    const report = await applyImport(plan.validos, plan.omitidos, mode());
    $('reporte').textContent = `Listo. ${T.importadoOk(report)}`;
    showStep('paso-hecho');
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
  showStep('paso-elegir');
}

// ------------------------------------------------------------------ pintado

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
  li.append(customer.nombre, ' ', doc(customer));
  return li;
}

/** El nombre que se pierde solo se enseña si de verdad cambia. */
function collisionRow(entrante: Customer, actual: Customer): HTMLLIElement {
  const li = document.createElement('li');

  if (actual.nombre !== entrante.nombre) {
    const antes = document.createElement('span');
    antes.className = 'pisa';
    antes.textContent = actual.nombre;

    const flecha = document.createElement('span');
    flecha.className = 'flecha';
    flecha.textContent = '→';

    li.append(antes, flecha);
  }

  li.append(entrante.nombre, ' ', doc(entrante));
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

// ------------------------------------------------------------------ utilería

function mode(): 'merge' | 'replace' {
  const checked = document.querySelector<HTMLInputElement>('input[name="modo"]:checked');
  return checked?.value === 'replace' ? 'replace' : 'merge';
}

function showStep(id: 'paso-elegir' | 'paso-previa' | 'paso-hecho'): void {
  for (const step of ['paso-elegir', 'paso-previa', 'paso-hecho'] as const) {
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
