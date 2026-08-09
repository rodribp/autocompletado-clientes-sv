import { SKIP_REASONS, T } from '../common/i18n.js';
import type { FieldKey, FillReport } from '../common/messages.js';

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

// A partial fill doesn't auto-hide: the user needs to read and copy what was missed.
export function toastFillReport(report: FillReport): void {
  const el = element();
  clearTimeout(hideTimer);

  // "No stored value" isn't a failure: a customer without email is normal.
  const problems = report.skipped.filter((s) => s.reason !== 'EMPTY_VALUE');

  if (problems.length === 0) {
    toast(T.filledOk(report.filled.length), 'ok');
    return;
  }

  el.className = 'toast warn';
  el.hidden = false;
  el.replaceChildren();

  const heading = document.createElement('div');
  heading.textContent = T.filledPartial(report.filled.length, problems.length);
  el.append(heading);

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = T.showDetails;
  details.append(summary);

  const list = document.createElement('ul');
  for (const problem of problems) {
    const item = document.createElement('li');
    const reason = SKIP_REASONS[problem.reason] ?? problem.reason;
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
  button.className = 'copy';
  button.textContent = `${T.copy} «${value}»`;
  button.addEventListener('click', () => {
    void navigator.clipboard.writeText(value).then(
      () => {
        button.textContent = T.copied;
      },
      () => {
        button.textContent = 'No se pudo copiar';
      },
    );
  });
  return button;
}

const FIELD_LABELS: Record<FieldKey, string> = {
  docType: 'Tipo de documento',
  docNumber: 'Número de documento',
  nit: 'NIT',
  name: 'Nombre',
  tradeName: 'Nombre comercial',
  nrc: 'NRC',
  activity: 'Actividad económica',
  activityDescription: 'Descripción de la actividad',
  department: 'Departamento',
  municipality: 'Municipio',
  district: 'Distrito',
  details: 'Complemento',
  email: 'Correo',
  phone: 'Teléfono',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key as FieldKey] ?? key;
}
