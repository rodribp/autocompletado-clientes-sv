// SPDX-License-Identifier: MIT
//
// Service worker: intermediario de almacenamiento para el content script, y
// badge «CF»/«CCF» en el icono según la pestaña.
//
// El intermediario es la puerta que usará el autocompletado en página cuando
// exista, y evita que el content script conozca el esquema de datos.

import { mergeCatalog, type CatalogDelta } from '../common/catalog.js';
import { err, ok, respondAsync, type Envelope, type Res, type ToBackgroundKind } from '../common/messages.js';
import { getCustomer, listCustomers, searchCustomers } from '../common/storage.js';

const PORTAL_PREFIX = 'https://admin.factura.gob.sv/';

chrome.runtime.onMessage.addListener(
  respondAsync(async (message: Envelope<string, unknown>): Promise<Res<unknown>> => {
    switch (message.kind as ToBackgroundKind) {
      case 'QUERY_CUSTOMERS': {
        const { q, limit } = message.payload as { q: string; limit?: number };
        const all = await listCustomers();
        const found = searchCustomers(all, q ?? '');
        return ok(typeof limit === 'number' ? found.slice(0, limit) : found);
      }

      case 'GET_CUSTOMER': {
        const { id } = message.payload as { id: string };
        if (!id) return err('BAD_REQUEST', 'Falta el id del cliente.');
        return ok((await getCustomer(id)) ?? null);
      }

      case 'PUT_CATALOG': {
        await mergeCatalog(message.payload as CatalogDelta);
        return ok({});
      }

      default:
        return err('BAD_REQUEST', `Mensaje desconocido: ${message.kind}`);
    }
  }),
);

// ------------------------------------------------------------------- badge

/** Heurística barata solo para el badge; la detección real la hace el content script. */
function badgeForUrl(url: string | undefined): string {
  if (!url || !url.startsWith(PORTAL_PREFIX)) return '';
  const path = url.slice(PORTAL_PREFIX.length).split(/[?#]/)[0] ?? '';
  if (/^ccf\b/i.test(path)) return 'CCF';
  if (/^cf\b/i.test(path)) return 'CF';
  return '';
}

async function refreshBadge(tabId: number, url: string | undefined): Promise<void> {
  const text = badgeForUrl(url);
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (text) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#1d6f42' });
  } catch {
    // La pestaña puede haberse cerrado entre el evento y esta llamada.
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.url) refreshBadge(tabId, changeInfo.url ?? tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await refreshBadge(tabId, tab.url);
  } catch {
    // idem
  }
});
