// SPDX-License-Identifier: MIT
//
// Respaldos en JSON: la vía para llevarse los clientes a otra máquina.

import { exportJson } from '../common/storage.js';

/** Un enlace sintético a un blob evita tener que pedir el permiso `downloads`. */
export async function downloadBackup(): Promise<void> {
  const json = await exportJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `clientes-sv-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Dar margen a que empiece la descarga antes de soltar el blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Restaurar no vive aquí: abrir el selector de archivos cierra el popup, así que
 * la importación tiene su propia página. Ver `src/import/index.ts`.
 */
export function openImportPage(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL('import.html') });
}
