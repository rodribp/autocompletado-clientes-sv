// Managing products only: they reach an invoice through the suggestions in the portal's pop-up.

import { T } from '../common/i18n.js';
import { formatPrice, parsePrice, squish } from '../common/normalize.js';
import { deleteProduct, listProducts, saveProduct, searchProducts } from '../common/storage.js';
import {
  ITEM_TYPES,
  SALE_TYPES,
  UNITS,
  isItemType,
  isSaleType,
  unitName,
  type Product,
  type ProductDraft,
} from '../common/types.js';
import { hasErrors, validateProduct, type ProductErrors } from '../common/validate.js';
import { chip, renderList, type ListView } from './list.js';
import { toast } from './toast.js';

const state = {
  all: [] as Product[],
  visible: [] as Product[],
  confirmingId: null as string | null,
  editingId: null as string | null,
};

const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

function form(): HTMLFormElement {
  return $<HTMLFormElement>('product-form');
}

function field<E extends HTMLElement>(name: string): E {
  return form().elements.namedItem(name) as unknown as E;
}

export async function initProducts(): Promise<void> {
  field<HTMLSelectElement>('itemType').replaceChildren(
    ...Object.entries(ITEM_TYPES).map(([code, label]) => new Option(label, code)),
  );
  field<HTMLSelectElement>('unit').replaceChildren(...UNITS.map((u) => new Option(u.name, u.code)));
  field<HTMLSelectElement>('saleType').replaceChildren(
    ...Object.entries(SALE_TYPES).map(([code, label]) => new Option(label, code)),
  );

  $('product-search').addEventListener('input', applyFilter);
  $('btn-new-product').addEventListener('click', () => showProductEditor(null));
  $('btn-cancel-product').addEventListener('click', () => showProductList());
  form().addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });
  field<HTMLInputElement>('price').addEventListener('blur', () => showErrors(validateProduct(readDraft())));

  // Delegated: the cancel button is recreated on every render.
  $('product-list').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).dataset.action === 'cancel-delete') {
      state.confirmingId = null;
      renderProducts();
    }
  });

  await refreshProducts();
}

export async function refreshProducts(): Promise<void> {
  state.all = await listProducts();
  applyFilter();
}

function applyFilter(): void {
  state.visible = searchProducts(state.all, $<HTMLInputElement>('product-search').value);
  renderProducts();
}

const view = (): ListView<Product> => ({
  list: $<HTMLUListElement>('product-list'),
  empty: $('product-empty'),
  emptyText: $<HTMLInputElement>('product-search').value ? T.noProductResults : T.noProducts,
  title: (p) => p.description,
  chips: productChips,
});

function productChips(p: Product): HTMLElement[] {
  const chips = [chip(formatPrice(p.price)), chip(ITEM_TYPES[p.itemType]), chip(unitName(p.unit))];
  if (p.saleType !== 'G') chips.push(chip(SALE_TYPES[p.saleType]));
  if (p.code) chips.push(chip(p.code));
  return chips;
}

function renderProducts(): void {
  renderList(
    view(),
    { items: state.visible, selected: -1, confirmingId: state.confirmingId, canFill: false },
    {
      onEdit: (p) => showProductEditor(p),
      onDelete: (p) => void requestDelete(p),
    },
  );
}

async function requestDelete(product: Product): Promise<void> {
  if (state.confirmingId !== product.id) {
    state.confirmingId = product.id;
    renderProducts();
    return;
  }

  state.confirmingId = null;
  await deleteProduct(product.id);
  await refreshProducts();
  toast(T.productDeletedOk, 'ok');
}

export function showProductEditor(product: Product | null): void {
  form().reset();
  showErrors({});
  state.editingId = product?.id ?? null;
  $('product-edit-title').textContent = product ? T.editProduct : T.newProduct;

  field<HTMLTextAreaElement>('description').value = product?.description ?? '';
  field<HTMLInputElement>('code').value = product?.code ?? '';
  field<HTMLSelectElement>('itemType').value = product?.itemType ?? '1';
  field<HTMLSelectElement>('unit').value = product?.unit ?? '59';
  field<HTMLSelectElement>('saleType').value = product?.saleType ?? 'G';
  field<HTMLInputElement>('price').value = product ? String(product.price) : '';
  field<HTMLTextAreaElement>('notes').value = product?.notes ?? '';

  $('products-view').hidden = true;
  $('product-edit-view').hidden = false;
  field<HTMLTextAreaElement>('description').focus();
}

export function showProductList(): void {
  $('product-edit-view').hidden = true;
  $('products-view').hidden = false;
  $<HTMLInputElement>('product-search').focus();
}

function readDraft(): ProductDraft {
  const itemType = field<HTMLSelectElement>('itemType').value;
  const saleType = field<HTMLSelectElement>('saleType').value;

  const draft: ProductDraft = {
    description: squish(field<HTMLTextAreaElement>('description').value),
    code: squish(field<HTMLInputElement>('code').value),
    itemType: isItemType(itemType) ? itemType : '1',
    unit: field<HTMLSelectElement>('unit').value,
    saleType: isSaleType(saleType) ? saleType : 'G',
    // NaN on bad input: `validateProduct` rejects it.
    price: parsePrice(field<HTMLInputElement>('price').value) ?? NaN,
    notes: field<HTMLTextAreaElement>('notes').value.trim(),
  };
  if (state.editingId) draft.id = state.editingId;
  return draft;
}

function showErrors(errors: ProductErrors): boolean {
  for (const slot of form().querySelectorAll('[data-error-for]')) slot.textContent = '';
  for (const [key, message] of Object.entries(errors)) {
    const slot = form().querySelector(`[data-error-for="${key}"]`);
    if (slot) slot.textContent = message;
  }
  return !hasErrors(errors);
}

async function submit(): Promise<void> {
  const draft = readDraft();
  if (!showErrors(validateProduct(draft))) return;

  await saveProduct(draft);
  await refreshProducts();
  showProductList();
  toast(T.productSavedOk, 'ok');
}
