// SPDX-License-Identifier: MIT
//
// Localizar la sección Receptor.
//
// El portal repite `formcontrolname` e ids entre las pestañas Emisor y
// Receptor. Una consulta global no falla ruidosamente: sobrescribe en silencio
// los datos fiscales *del propio usuario*. De ahí `q()` con raíz acotada, y
// ningún `getElementById` en todo el proyecto.

import { waitFor } from '../dom.js';
import type { FormType } from '../../common/messages.js';

/** Se mira el DOM y no la URL: es una SPA y la ruta cambia antes de montarse. */
export function detectFormType(): FormType | null {
  if (document.querySelector('app-facturador-ccf')) return 'ccf';
  if (document.querySelector('app-facturador-cf')) return 'cf';
  return null;
}

/**
 * CCF envuelve el receptor en `<app-common-receptor>`; CF, pese al nombre
 * «common» de ese componente, no lo usa y escribe los campos en su plantilla.
 */
export function receptorRoot(formType: FormType): HTMLElement | null {
  if (formType === 'ccf') {
    return document.querySelector<HTMLElement>('app-common-receptor');
  }
  return document.querySelector<HTMLElement>('app-facturador-cf tab[heading="Receptor"]');
}

/** Igual que `receptorRoot`, pero esperando a que Angular termine de montar. */
export function awaitReceptorRoot(formType: FormType, timeout = 8000): Promise<HTMLElement | null> {
  return waitFor(() => receptorRoot(formType), { timeout });
}

/**
 * Busca un control **dentro de una raíz ya acotada**. La única forma
 * autorizada de encontrar un campo en este proyecto.
 */
export function q<T extends Element>(root: ParentNode, control: string): T | null {
  return root.querySelector<T>(`[formcontrolname="${control}"]`);
}

/**
 * Trae al frente la pestaña Receptor si estaba oculta, para que el usuario vea
 * el resultado del relleno en vez de tener que ir a buscarlo.
 */
export function activateReceptorTab(): void {
  const tab = document.querySelector('tab[heading="Receptor"]');
  if (!tab || tab.classList.contains('active')) return;

  // ngx-bootstrap pinta las cabeceras como `<li><a role="tab"><span>Receptor</span></a></li>`,
  // en el mismo orden que los `<tab>` del contenido, pero fuera de ellos.
  const tabset = tab.closest('tabset');
  const headings = tabset?.querySelectorAll<HTMLElement>('a[role="tab"]') ?? [];
  for (const heading of headings) {
    if (heading.textContent?.trim() === 'Receptor') {
      heading.click();
      return;
    }
  }
}
