// SPDX-License-Identifier: MIT
//
// Controlador del popup: estado de la pestaña, lista, formulario y respaldos.
//
// El CRUD funciona siempre. Solo «Rellenar» y «Guardar cliente actual» dependen
// de la pestaña; cuando no se puede, se deshabilitan y un banner explica por qué.

import { ERRORES, T } from '../common/i18n.js';
import { sendToTab, type FormType, type Res } from '../common/messages.js';
import { deleteCustomer, listCustomers, saveCustomer, searchCustomers } from '../common/storage.js';
import { validateDraft } from '../common/validate.js';
import type { Customer } from '../common/types.js';
import { initEditView, openEditor, readDraft, reloadCatalog, showErrors } from './edit.js';
import { downloadBackup, openImportPage } from './io.js';
import { renderList, type ListState } from './list.js';
import { hideToast, toast, toastFillReport } from './toast.js';

const PORTAL_PREFIX = 'https://admin.factura.gob.sv/';

type PageState = 'OFF_SITE' | 'NO_CONTENT_SCRIPT' | 'WRONG_PAGE' | 'READY';

interface AppState {
  all: Customer[];
  visible: Customer[];
  selected: number;
  confirmingId: string | null;
  page: PageState;
  formType: FormType | null;
  tabId: number | null;
}

const state: AppState = {
  all: [],
  visible: [],
  selected: -1,
  confirmingId: null,
  page: 'OFF_SITE',
  formType: null,
  tabId: null,
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ arranque

async function main(): Promise<void> {
  await initEditView();
  wireEvents();
  await Promise.all([refreshCustomers(), refreshPageState()]);

  // Mantener la lista al día si otra ventana del popup o el background escriben.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.db) void refreshCustomers();
    if (area === 'local' && changes.catalog) void reloadCatalog();
  });
}

function wireEvents(): void {
  $('buscar').addEventListener('input', applyFilter);
  $('btn-nuevo').addEventListener('click', () => showEditor(null));
  $('btn-capturar').addEventListener('click', () => void captureCurrent());
  $('btn-cancelar-edicion').addEventListener('click', () => showList());

  $<HTMLFormElement>('form-cliente').addEventListener('submit', (event) => {
    event.preventDefault();
    void submitEditor();
  });

  // Menú «⋯»
  const menuButton = $<HTMLButtonElement>('btn-menu');
  const menuPanel = $('menu-panel');
  menuButton.addEventListener('click', () => {
    const open = menuPanel.hidden;
    menuPanel.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (event) => {
    if (!menuPanel.hidden && !menuPanel.contains(event.target as Node) && event.target !== menuButton) {
      menuPanel.hidden = true;
      menuButton.setAttribute('aria-expanded', 'false');
    }
  });

  $('btn-exportar').addEventListener('click', () => void handleExport());
  $('btn-importar').addEventListener('click', () => handleImport());
  $('btn-diagnostico').addEventListener('click', () => void handleDiagnose());

  // Cancelar el borrado se delega, porque el botón se recrea en cada render.
  $('lista').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).dataset.action === 'cancel-delete') {
      state.confirmingId = null;
      render();
    }
  });

  document.addEventListener('keydown', onKeyDown);
}

// ------------------------------------------------------------------- datos

async function refreshCustomers(): Promise<void> {
  state.all = await listCustomers();
  applyFilter();
}

function applyFilter(): void {
  const query = $<HTMLInputElement>('buscar').value;
  state.visible = searchCustomers(state.all, query);
  if (state.selected >= state.visible.length) state.selected = state.visible.length - 1;
  render();
}

function render(): void {
  const listState: ListState = {
    customers: state.visible,
    selected: state.selected,
    confirmingId: state.confirmingId,
    canFill: state.page === 'READY',
  };

  renderList(listState, {
    onFill: (customer) => void fill(customer),
    onEdit: (customer) => showEditor(customer),
    onDelete: (customer) => void requestDelete(customer),
  });
}

// -------------------------------------------------------- estado de pestaña

async function refreshPageState(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab?.id ?? null;

  if (!tab?.id || !tab.url?.startsWith(PORTAL_PREFIX)) {
    setPageState('OFF_SITE', null);
    return;
  }

  let ping = await sendToTab(tab.id, 'PING', {});

  // Tras instalar o actualizar, una pestaña ya abierta no tiene content script.
  if (!ping.ok) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      ping = await sendToTab(tab.id, 'PING', {});
    } catch {
      // Sin permiso o pestaña protegida: se informa abajo.
    }
  }

  if (!ping.ok) {
    setPageState('NO_CONTENT_SCRIPT', null);
    return;
  }

  if (!ping.data.formType) {
    setPageState('WRONG_PAGE', null);
    return;
  }

  setPageState('READY', ping.data.formType);
}

function setPageState(page: PageState, formType: FormType | null): void {
  state.page = page;
  state.formType = formType;

  const banner = $('aviso');
  const badge = $('badge');
  const capture = $<HTMLButtonElement>('btn-capturar');

  badge.hidden = formType === null;
  badge.textContent = formType ? formType.toUpperCase() : '';
  capture.hidden = page !== 'READY';
  capture.title = T.guardarActualAyuda;
  capture.textContent = T.guardarActual;

  if (page === 'READY') {
    banner.hidden = true;
  } else {
    banner.hidden = false;
    banner.replaceChildren(
      document.createTextNode(
        page === 'OFF_SITE' ? T.offSite : page === 'WRONG_PAGE' ? T.wrongPage : T.noContentScript,
      ),
    );
    if (page === 'NO_CONTENT_SCRIPT') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'subtle';
      retry.textContent = T.reintentar;
      retry.addEventListener('click', () => void refreshPageState());
      banner.append(retry);
    }
  }

  render();
}

// ----------------------------------------------------------------- acciones

async function fill(customer: Customer): Promise<void> {
  if (state.page !== 'READY' || state.tabId === null) return;

  toast('Rellenando…', 'info', 0);
  const result = await sendToTab(state.tabId, 'FILL_RECEPTOR', { customer });

  if (!result.ok) {
    reportError(result);
    return;
  }

  toastFillReport(result.data);
  // El relleno hizo renderizar municipios y distritos: el catálogo pudo crecer.
  await reloadCatalog();
}

async function captureCurrent(): Promise<void> {
  if (state.page !== 'READY' || state.tabId === null) return;

  const result = await sendToTab(state.tabId, 'CAPTURE_RECEPTOR', {});
  if (!result.ok) {
    reportError(result);
    return;
  }

  await reloadCatalog();
  showEditor(result.data.draft);

  if (result.data.missing.length > 0) {
    toast('Se leyó lo que había en pantalla. Revisa los campos vacíos antes de guardar.', 'warn', 6000);
  } else {
    hideToast();
  }
}

async function submitEditor(): Promise<void> {
  const draft = readDraft();
  if (!showErrors(validateDraft(draft))) return;

  await saveCustomer(draft);
  await refreshCustomers();
  showList();
  toast(T.guardadoOk, 'ok');
}

/** Primer clic pide confirmación en la propia fila; el segundo borra. */
async function requestDelete(customer: Customer): Promise<void> {
  if (state.confirmingId !== customer.id) {
    state.confirmingId = customer.id;
    render();
    return;
  }

  state.confirmingId = null;
  await deleteCustomer(customer.id);
  await refreshCustomers();
  toast(T.eliminadoOk, 'ok');
}

async function handleExport(): Promise<void> {
  $('menu-panel').hidden = true;
  await downloadBackup();
  toast('Respaldo descargado.', 'ok');
}

/**
 * La importación se hace en su propia pestaña. El popup se cerrará en cuanto
 * pierda el foco, que es justo el motivo de no hacerlo aquí; la lista se
 * refresca sola cuando la otra pestaña escriba, vía `chrome.storage.onChanged`.
 */
function handleImport(): void {
  $('menu-panel').hidden = true;
  openImportPage();
}

async function handleDiagnose(): Promise<void> {
  $('menu-panel').hidden = true;
  if (state.page !== 'READY' || state.tabId === null) {
    toast(T.wrongPage, 'warn');
    return;
  }

  const result = await sendToTab(state.tabId, 'DIAGNOSE', {});
  if (!result.ok) {
    reportError(result);
    return;
  }

  const { formType, found, missing } = result.data;
  toast(
    missing.length === 0
      ? `Formulario ${formType.toUpperCase()}: los ${found.length} campos conocidos están presentes.`
      : `Formulario ${formType.toUpperCase()}: faltan ${missing.length} campos (${missing.join(', ')}). El portal pudo cambiar.`,
    missing.length === 0 ? 'ok' : 'warn',
    0,
  );
}

function reportError(result: Res<unknown>): void {
  if (result.ok) return;
  toast(ERRORES[result.error.code] ?? result.error.message, 'error', 8000);
}

// --------------------------------------------------------------- navegación

function showEditor(customer: Partial<Customer> | null): void {
  openEditor(customer);
  $('vista-lista').hidden = true;
  $('vista-edicion').hidden = false;
  (document.querySelector('#form-cliente [name="nombre"]') as HTMLInputElement)?.focus();
}

function showList(): void {
  $('vista-edicion').hidden = true;
  $('vista-lista').hidden = false;
  $<HTMLInputElement>('buscar').focus();
}

function editing(): boolean {
  return !$('vista-edicion').hidden;
}

function onKeyDown(event: KeyboardEvent): void {
  if (editing()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      showList();
    }
    return;
  }

  const target = event.target as HTMLElement;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

  if (event.key === '/' && !typing) {
    event.preventDefault();
    $<HTMLInputElement>('buscar').focus();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (state.visible.length === 0) return;
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    state.selected = Math.max(0, Math.min(state.visible.length - 1, state.selected + delta));
    render();
    document.querySelector('.item.sel')?.scrollIntoView({ block: 'nearest' });
    return;
  }

  if (event.key === 'Enter' && state.selected >= 0) {
    const customer = state.visible[state.selected];
    if (customer && state.page === 'READY') {
      event.preventDefault();
      void fill(customer);
    }
  }
}

void main();
