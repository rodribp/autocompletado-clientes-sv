// SPDX-License-Identifier: MIT
//
// `chrome.storage.local` en memoria, suficiente para probar la capa de
// almacenamiento sin un navegador.

interface StubStore {
  data: Record<string, unknown>;
  reset(): void;
}

export function installChromeStub(): StubStore {
  const data: Record<string, unknown> = {};

  const local = {
    async get(keys?: string | string[] | null) {
      if (keys == null) return { ...data };
      const list = typeof keys === 'string' ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const key of list) if (key in data) out[key] = data[key];
      return out;
    },
    async set(items: Record<string, unknown>) {
      // Estructurar-clonar como hace el almacenamiento real: así se detecta si
      // el código guarda por referencia y muta lo guardado sin querer.
      for (const [key, value] of Object.entries(items)) {
        data[key] = JSON.parse(JSON.stringify(value));
      }
    },
    async remove(key: string) {
      delete data[key];
    },
    async clear() {
      for (const key of Object.keys(data)) delete data[key];
    },
  };

  const g = globalThis as unknown as Record<string, unknown>;
  g.chrome = { storage: { local, onChanged: { addListener() {} } } };

  if (typeof g.crypto === 'undefined') {
    g.crypto = { randomUUID: () => `id-${Math.random().toString(36).slice(2, 10)}` };
  }

  return {
    data,
    reset() {
      for (const key of Object.keys(data)) delete data[key];
    },
  };
}
