// DOM APIs, not `innerHTML`: names are user data and never need escaping this way.

import { T } from '../common/i18n.js';
import { formatDocNumber, formatNrc } from '../common/normalize.js';
import { DOC_TYPES, ccfIssues, type Customer } from '../common/types.js';

export interface ListCallbacks {
  onFill(customer: Customer): void;
  onEdit(customer: Customer): void;
  onDelete(customer: Customer): void;
}

export interface ListState {
  customers: Customer[];
  /** Keyboard-highlighted index, or -1. */
  selected: number;
  confirmingId: string | null;
  canFill: boolean;
}

export function renderList(state: ListState, callbacks: ListCallbacks): void {
  const list = document.getElementById('list') as HTMLUListElement;
  const empty = document.getElementById('empty') as HTMLElement;

  list.replaceChildren();

  if (state.customers.length === 0) {
    empty.hidden = false;
    empty.textContent = (document.getElementById('search') as HTMLInputElement).value
      ? T.noResults
      : T.noCustomers;
    return;
  }

  empty.hidden = true;
  state.customers.forEach((customer, index) => {
    list.append(renderItem(customer, index, state, callbacks));
  });
}

function renderItem(customer: Customer, index: number, state: ListState, callbacks: ListCallbacks): HTMLLIElement {
  const item = document.createElement('li');
  item.className = index === state.selected ? 'item sel' : 'item';
  item.dataset.id = customer.id;

  const header = document.createElement('div');
  header.className = 'item-header';
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = customer.name;
  header.append(name);
  item.append(header);

  const meta = document.createElement('div');
  meta.className = 'item-meta';
  meta.append(chip(`${DOC_TYPES[customer.docType]} ${formatDocNumber(customer.docType, customer.docNumber)}`));
  if (customer.nrc) meta.append(chip(`NRC ${formatNrc(customer.nrc)}`));

  const issues = ccfIssues(customer);
  if (issues.length > 0) {
    const warn = chip(T.notCcfEligible);
    warn.classList.add('chip-warn');
    warn.title = issues.join('\n');
    meta.append(warn);
  }
  item.append(meta);

  if (state.confirmingId === customer.id) {
    item.append(renderConfirm(customer, callbacks));
  } else {
    item.append(renderActions(customer, state, callbacks));
  }

  return item;
}

function renderActions(customer: Customer, state: ListState, callbacks: ListCallbacks): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const fill = document.createElement('button');
  fill.type = 'button';
  fill.className = 'primary';
  fill.textContent = T.fill;
  fill.disabled = !state.canFill;
  if (!state.canFill) fill.title = T.offSite;
  fill.addEventListener('click', () => callbacks.onFill(customer));

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn';
  edit.textContent = '✎';
  edit.title = T.edit;
  edit.setAttribute('aria-label', `${T.edit} ${customer.name}`);
  edit.addEventListener('click', () => callbacks.onEdit(customer));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn';
  remove.textContent = '🗑';
  remove.title = T.remove;
  remove.setAttribute('aria-label', `${T.remove} ${customer.name}`);
  remove.addEventListener('click', () => callbacks.onDelete(customer));

  actions.append(fill, edit, remove);
  return actions;
}

/** Two-step confirmation inside the row instead of `window.confirm`. */
function renderConfirm(customer: Customer, callbacks: ListCallbacks): HTMLElement {
  const box = document.createElement('div');
  box.className = 'confirm';

  const question = document.createElement('span');
  question.textContent = T.confirmDelete(customer.name);

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'danger';
  confirm.textContent = T.remove;
  confirm.addEventListener('click', () => callbacks.onDelete(customer));

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'subtle';
  cancel.textContent = T.cancel;
  cancel.dataset.action = 'cancel-delete';

  box.append(question, confirm, cancel);
  return box;
}

function chip(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'chip';
  span.textContent = text;
  return span;
}
