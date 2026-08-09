import { exportJson } from '../common/storage.js';

/** A synthetic blob link avoids requesting the `downloads` permission. */
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

  // Give the download time to start before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Import has its own page: opening the file picker closes the popup.
export function openImportPage(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL('import.html') });
}
