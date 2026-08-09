// SPDX-License-Identifier: MIT
//
// Lista de clientes. Se construye con el DOM, no con `innerHTML`: los nombres
// vienen de datos del usuario y no queremos preocuparnos nunca de escaparlos.

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
  /** Índice resaltado por teclado, o -1. */
  selected: number;
  /** Cliente con la confirmación de borrado abierta. */
  confirmingId: string | null;
  /** `false` cuando la pestaña activa no admite relleno. */
  canFill: boolean;
}

export function renderList(state: ListState, callbacks: ListCallbacks): void {
  const list = document.getElementById('lista') as HTMLUListElement;
  const empty = document.getElementById('vacio') as HTMLElement;

  list.replaceChildren();

  if (state.customers.length === 0) {
    empty.hidden = false;
    empty.textContent = (document.getElementById('buscar') as HTMLInputElement).value
      ? T.sinResultados
      : T.sinClientes;
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
  header.className = 'item-cabecera';
  const name = document.createElement('span');
  name.className = 'item-nombre';
  name.textContent = customer.nombre;
  header.append(name);
  item.append(header);

  const meta = document.createElement('div');
  meta.className = 'item-meta';
  meta.append(chip(`${DOC_TYPES[customer.docType]} ${formatDocNumber(customer.docType, customer.docNumber)}`));
  if (customer.nrc) meta.append(chip(`NRC ${formatNrc(customer.nrc)}`));

  const issues = ccfIssues(customer);
  if (issues.length > 0) {
    const warn = chip(T.noAptoCcf);
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
  actions.className = 'item-acciones';

  const fill = document.createElement('button');
  fill.type = 'button';
  fill.className = 'primary';
  fill.textContent = T.rellenar;
  fill.disabled = !state.canFill;
  if (!state.canFill) fill.title = T.offSite;
  fill.addEventListener('click', () => callbacks.onFill(customer));

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn';
  edit.textContent = '✎';
  edit.title = T.editar;
  edit.setAttribute('aria-label', `${T.editar} ${customer.nombre}`);
  edit.addEventListener('click', () => callbacks.onEdit(customer));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn';
  remove.textContent = '🗑';
  remove.title = T.eliminar;
  remove.setAttribute('aria-label', `${T.eliminar} ${customer.nombre}`);
  remove.addEventListener('click', () => callbacks.onDelete(customer));

  actions.append(fill, edit, remove);
  return actions;
}

/** Confirmación en dos pasos dentro de la fila, en vez de un `window.confirm`. */
function renderConfirm(customer: Customer, callbacks: ListCallbacks): HTMLElement {
  const box = document.createElement('div');
  box.className = 'confirmar';

  const question = document.createElement('span');
  question.textContent = T.confirmarEliminar(customer.nombre);

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'danger';
  confirm.textContent = T.eliminar;
  confirm.addEventListener('click', () => callbacks.onDelete(customer));

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'subtle';
  cancel.textContent = T.cancelar;
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
