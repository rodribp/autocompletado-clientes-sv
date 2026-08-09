// SPDX-License-Identifier: MIT
//
// Respaldos en JSON: la vía para llevarse los clientes a otra máquina.

import { exportJson, importJson, type ImportReport } from '../common/storage.js';

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

export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsText(file);
  });
}

export async function restoreBackup(file: File): Promise<ImportReport> {
  return importJson(await readFile(file), 'merge');
}
