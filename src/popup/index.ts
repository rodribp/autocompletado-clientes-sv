// Only "Fill" and "Save current customer" depend on the tab; CRUD always works.

import { ERROR_MESSAGES, T } from '../common/i18n.js';
import { sendToTab, type FormType, type Res } from '../common/messages.js';
import { deleteCustomer, listCustomers, saveCustomer, searchCustomers } from '../common/storage.js';
import { validateDraft } from '../common/validate.js';
import type { Customer } from '../common/types.js';
import { initEditView, openEditor, readDraft, reloadCatalog, showErrors } from './edit.js';
import { downloadBackup, openImportPage } from './io.js';
import { renderList, type ListState } from './list.js';
import { fieldLabel, hideToast, toast, toastFillReport } from './toast.js';

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

async function main(): Promise<void> {
  await initEditView();
  wireEvents();
  await Promise.all([refreshCustomers(), refreshPageState()]);

  // Keep the list fresh if another popup window or the background writes.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.db) void refreshCustomers();
    if (area === 'local' && changes.catalog) void reloadCatalog();
  });
}

function wireEvents(): void {
  $('search').addEventListener('input', applyFilter);
  $('btn-new').addEventListener('click', () => showEditor(null));
  $('btn-capture').addEventListener('click', () => void captureCurrent());
  $('btn-cancel-edit').addEventListener('click', () => showList());

  $<HTMLFormElement>('customer-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void submitEditor();
  });

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

  $('btn-export').addEventListener('click', () => void handleExport());
  $('btn-import').addEventListener('click', () => handleImport());
  $('btn-diagnose').addEventListener('click', () => void handleDiagnose());

  // Delegated: the cancel button is recreated on every render.
  $('list').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).dataset.action === 'cancel-delete') {
      state.confirmingId = null;
      render();
    }
  });

  document.addEventListener('keydown', onKeyDown);
}

async function refreshCustomers(): Promise<void> {
  state.all = await listCustomers();
  applyFilter();
}

function applyFilter(): void {
  const query = $<HTMLInputElement>('search').value;
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

async function refreshPageState(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab?.id ?? null;

  if (!tab?.id || !tab.url?.startsWith(PORTAL_PREFIX)) {
    setPageState('OFF_SITE', null);
    return;
  }

  let ping = await sendToTab(tab.id, 'PING', {});

  // After install or update, already-open tabs have no content script.
  if (!ping.ok) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      ping = await sendToTab(tab.id, 'PING', {});
    } catch {
      // No permission or protected tab: reported below.
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

  const banner = $('notice');
  const badge = $('badge');
  const capture = $<HTMLButtonElement>('btn-capture');

  badge.hidden = formType === null;
  badge.textContent = formType ? formType.toUpperCase() : '';
  capture.hidden = page !== 'READY';
  capture.title = T.saveCurrentHelp;
  capture.textContent = T.saveCurrent;

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
      retry.textContent = T.retry;
      retry.addEventListener('click', () => void refreshPageState());
      banner.append(retry);
    }
  }

  render();
}

async function fill(customer: Customer): Promise<void> {
  if (state.page !== 'READY' || state.tabId === null) return;

  toast('Rellenando…', 'info', 0);
  const result = await sendToTab(state.tabId, 'FILL_RECIPIENT', { customer });

  if (!result.ok) {
    reportError(result);
    return;
  }

  toastFillReport(result.data);
  // Filling rendered municipalities and districts, so the catalog may have grown.
  await reloadCatalog();
}

async function captureCurrent(): Promise<void> {
  if (state.page !== 'READY' || state.tabId === null) return;

  const result = await sendToTab(state.tabId, 'CAPTURE_RECIPIENT', {});
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
  toast(T.savedOk, 'ok');
}

async function requestDelete(customer: Customer): Promise<void> {
  if (state.confirmingId !== customer.id) {
    state.confirmingId = customer.id;
    render();
    return;
  }

  state.confirmingId = null;
  await deleteCustomer(customer.id);
  await refreshCustomers();
  toast(T.deletedOk, 'ok');
}

async function handleExport(): Promise<void> {
  $('menu-panel').hidden = true;
  await downloadBackup();
  toast('Respaldo descargado.', 'ok');
}

// The list refreshes itself via `chrome.storage.onChanged` when the import tab writes.
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
      : `Formulario ${formType.toUpperCase()}: faltan ${missing.length} campos (${missing.map(fieldLabel).join(', ')}). El portal pudo cambiar.`,
    missing.length === 0 ? 'ok' : 'warn',
    0,
  );
}

function reportError(result: Res<unknown>): void {
  if (result.ok) return;
  toast(ERROR_MESSAGES[result.error.code] ?? result.error.message, 'error', 8000);
}

function showEditor(customer: Partial<Customer> | null): void {
  openEditor(customer);
  $('list-view').hidden = true;
  $('edit-view').hidden = false;
  (document.querySelector('#customer-form [name="name"]') as HTMLInputElement)?.focus();
}

function showList(): void {
  $('edit-view').hidden = true;
  $('list-view').hidden = false;
  $<HTMLInputElement>('search').focus();
}

function editing(): boolean {
  return !$('edit-view').hidden;
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
    $<HTMLInputElement>('search').focus();
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
