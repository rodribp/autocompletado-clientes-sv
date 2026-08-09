// Emisor and Receptor share `formcontrolname`s and ids: a global query would silently
// overwrite the user's own data. Hence scoped `q()` and no `getElementById`.

import { waitFor } from '../dom.js';
import type { FormType } from '../../common/messages.js';

// By DOM, not URL: in the SPA the route changes before the form mounts.
export function detectFormType(): FormType | null {
  if (document.querySelector('app-facturador-ccf')) return 'ccf';
  if (document.querySelector('app-facturador-cf')) return 'cf';
  return null;
}

// Only CCF uses `<app-common-receptor>`, despite the "common".
export function recipientRoot(formType: FormType): HTMLElement | null {
  if (formType === 'ccf') {
    return document.querySelector<HTMLElement>('app-common-receptor');
  }
  return document.querySelector<HTMLElement>('app-facturador-cf tab[heading="Receptor"]');
}

export function awaitRecipientRoot(formType: FormType, timeout = 8000): Promise<HTMLElement | null> {
  return waitFor(() => recipientRoot(formType), { timeout });
}

export function q<T extends Element>(root: ParentNode, control: string): T | null {
  return root.querySelector<T>(`[formcontrolname="${control}"]`);
}

export function activateRecipientTab(): void {
  const tab = document.querySelector('tab[heading="Receptor"]');
  if (!tab || tab.classList.contains('active')) return;

  // ngx-bootstrap renders the headings (`a[role="tab"]`) outside the `<tab>` elements.
  const tabset = tab.closest('tabset');
  const headings = tabset?.querySelectorAll<HTMLElement>('a[role="tab"]') ?? [];
  for (const heading of headings) {
    if (heading.textContent?.trim() === 'Receptor') {
      heading.click();
      return;
    }
  }
}
