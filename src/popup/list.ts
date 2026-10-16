// DOM APIs, not `innerHTML`: names are user data and never need escaping this way.

import { T } from '../common/i18n.js';
import { formatDocNumber, formatNrc } from '../common/normalize.js';
import { DOC_TYPES, ccfIssues, type Customer } from '../common/types.js';

export interface ListCallbacks<Item> {
  onFill?(item: Item): void;
  onEdit(item: Item): void;
  onDelete(item: Item): void;
}

export interface ListState<Item> {
  items: Item[];
  /** Keyboard-highlighted index, or -1. */
  selected: number;
  confirmingId: string | null;
  canFill: boolean;
}

/** What differs between the customer and product lists. */
export interface ListView<Item> {
  list: HTMLUListElement;
  empty: HTMLElement;
  emptyText: string;
  /** No label, no main button: the list only manages its items. */
  fillLabel?: string;
  title(item: Item): string;
  chips(item: Item): HTMLElement[];
}

export function renderList<Item extends { id: string }>(
  view: ListView<Item>,
  state: ListState<Item>,
  callbacks: ListCallbacks<Item>,
): void {
  view.list.replaceChildren();

  if (state.items.length === 0) {
    view.empty.hidden = false;
    view.empty.textContent = view.emptyText;
    return;
  }

  view.empty.hidden = true;
  state.items.forEach((item, index) => {
    view.list.append(renderItem(view, item, index, state, callbacks));
  });
}

function renderItem<Item extends { id: string }>(
  view: ListView<Item>,
  item: Item,
  index: number,
  state: ListState<Item>,
  callbacks: ListCallbacks<Item>,
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = index === state.selected ? 'item sel' : 'item';
  li.dataset.id = item.id;

  const header = document.createElement('div');
  header.className = 'item-header';
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = view.title(item);
  header.append(name);
  li.append(header);

  const meta = document.createElement('div');
  meta.className = 'item-meta';
  meta.append(...view.chips(item));
  li.append(meta);

  if (state.confirmingId === item.id) {
    li.append(renderConfirm(view, item, callbacks));
  } else {
    li.append(renderActions(view, item, state, callbacks));
  }

  return li;
}

export function customerChips(customer: Customer): HTMLElement[] {
  const chips = [chip(`${DOC_TYPES[customer.docType]} ${formatDocNumber(customer.docType, customer.docNumber)}`)];
  if (customer.nrc) chips.push(chip(`NRC ${formatNrc(customer.nrc)}`));

  const issues = ccfIssues(customer);
  if (issues.length > 0) {
    const warn = chip(T.notCcfEligible);
    warn.classList.add('chip-warn');
    warn.title = issues.join('\n');
    chips.push(warn);
  }
  return chips;
}

function renderActions<Item>(
  view: ListView<Item>,
  item: Item,
  state: ListState<Item>,
  callbacks: ListCallbacks<Item>,
): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'item-actions';

  if (view.fillLabel) {
    const fill = document.createElement('button');
    fill.type = 'button';
    fill.className = 'primary';
    fill.textContent = view.fillLabel;
    fill.disabled = !state.canFill;
    if (!state.canFill) fill.title = T.offSite;
    fill.addEventListener('click', () => callbacks.onFill?.(item));
    actions.append(fill);
  }

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn';
  edit.textContent = '✎';
  edit.title = T.edit;
  edit.setAttribute('aria-label', `${T.edit} ${view.title(item)}`);
  edit.addEventListener('click', () => callbacks.onEdit(item));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn';
  remove.textContent = '🗑';
  remove.title = T.remove;
  remove.setAttribute('aria-label', `${T.remove} ${view.title(item)}`);
  remove.addEventListener('click', () => callbacks.onDelete(item));

  actions.append(edit, remove);
  return actions;
}

/** Two-step confirmation inside the row instead of `window.confirm`. */
function renderConfirm<Item>(view: ListView<Item>, item: Item, callbacks: ListCallbacks<Item>): HTMLElement {
  const box = document.createElement('div');
  box.className = 'confirm';

  const question = document.createElement('span');
  question.textContent = T.confirmDelete(view.title(item));

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'danger';
  confirm.textContent = T.remove;
  confirm.addEventListener('click', () => callbacks.onDelete(item));

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'subtle';
  cancel.textContent = T.cancel;
  cancel.dataset.action = 'cancel-delete';

  box.append(question, confirm, cancel);
  return box;
}

export function chip(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'chip';
  span.textContent = text;
  return span;
}
