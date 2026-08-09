// SPDX-License-Identifier: MIT

import { MOTIVOS, T } from '../common/i18n.js';
import type { FillReport } from '../common/messages.js';

type Tone = 'ok' | 'warn' | 'error' | 'info';

function element(): HTMLElement {
  return document.getElementById('toast') as HTMLElement;
}

let hideTimer: number | undefined;

export function toast(message: string, tone: Tone = 'info', autoHideMs = 4000): void {
  const el = element();
  el.className = `toast ${tone === 'info' ? '' : tone}`.trim();
  el.replaceChildren(document.createTextNode(message));
  el.hidden = false;

  clearTimeout(hideTimer);
  if (autoHideMs > 0) hideTimer = setTimeout(hideToast, autoHideMs) as unknown as number;
}

export function hideToast(): void {
  clearTimeout(hideTimer);
  element().hidden = true;
}

/**
 * Muestra el resultado de un relleno.
 *
 * Un relleno parcial no se auto-oculta: si algo quedó sin poner, el usuario
 * necesita leer qué fue y copiarlo, y que el aviso desaparezca solo sería
 * exactamente lo contrario de lo que hace falta.
 */
export function toastFillReport(report: FillReport): void {
  const el = element();
  clearTimeout(hideTimer);

  // «Sin dato guardado» no es un fallo: un cliente sin correo es normal.
  const problems = report.skipped.filter((s) => s.reason !== 'EMPTY_VALUE');

  if (problems.length === 0) {
    toast(T.rellenadoOk(report.filled.length), 'ok');
    return;
  }

  el.className = 'toast warn';
  el.hidden = false;
  el.replaceChildren();

  const heading = document.createElement('div');
  heading.textContent = T.rellenadoParcial(report.filled.length, problems.length);
  el.append(heading);

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = T.verDetalle;
  details.append(summary);

  const list = document.createElement('ul');
  for (const problem of problems) {
    const item = document.createElement('li');
    const reason = MOTIVOS[problem.reason] ?? problem.reason;
    item.append(document.createTextNode(`${fieldLabel(problem.key)}: ${problem.hint ?? reason}`));

    if (problem.intended) {
      item.append(copyButton(problem.intended));
    }
    list.append(item);
  }

  details.append(list);
  details.open = true;
  el.append(details);
}

function copyButton(value: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copiar';
  button.textContent = `${T.copiar} «${value}»`;
  button.addEventListener('click', () => {
    void navigator.clipboard.writeText(value).then(
      () => {
        button.textContent = T.copiado;
      },
      () => {
        button.textContent = 'No se pudo copiar';
      },
    );
  });
  return button;
}

const FIELD_LABELS: Record<string, string> = {
  tipoDocumento: 'Tipo de documento',
  docNumber: 'Número de documento',
  nit: 'NIT',
  nombre: 'Nombre',
  nombreComercial: 'Nombre comercial',
  nrc: 'NRC',
  actividad: 'Actividad económica',
  descActividad: 'Descripción de la actividad',
  departamento: 'Departamento',
  municipio: 'Municipio',
  distrito: 'Distrito',
  complemento: 'Complemento',
  correo: 'Correo',
  telefono: 'Teléfono',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}
