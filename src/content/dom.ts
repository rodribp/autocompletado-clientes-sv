// SPDX-License-Identifier: MIT
//
// Cómo se escribe en un formulario de Angular desde un content script.
//
// El portal usa Angular 12 con formularios reactivos, y nosotros corremos en el
// mundo aislado de la extensión: no alcanzamos objetos de la página, solo el
// DOM y los eventos. De ahí salen casi todas las decisiones de este archivo.

/** El `set` nativo de `value`, sin pasar por posibles sobrescrituras del framework. */
function nativeValueSetter(el: HTMLInputElement | HTMLTextAreaElement): (v: string) => void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  const setter = descriptor?.set;
  if (!setter) return (v) => void (el.value = v);
  return (v) => setter.call(el, v);
}

export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  nativeValueSetter(el)(value);
}

function fire(el: Element, type: string, init: EventInit = {}): void {
  el.dispatchEvent(new Event(type, { bubbles: true, ...init }));
}

/**
 * Escribe de forma que Angular se entere. El `blur` no es decorativo: con
 * `updateOn: 'blur'`, un `input` solo no confirma nada y el valor se pierde.
 */
export function setText(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.focus();
  setNativeValue(el, value);
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  fire(el, 'change');
  fire(el, 'blur');
  el.blur();
}

/**
 * Tecleo simulado, de reserva para cuando `setText` no cuaja: ngx-mask
 * reformatea al vuelo y a veces ignora una asignación de golpe.
 */
export function typeText(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.focus();
  setNativeValue(el, '');
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));

  for (const char of value) {
    const next = el.value + char;
    setNativeValue(el, next);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
  }

  fire(el, 'change');
  fire(el, 'blur');
  el.blur();
}

/**
 * Selecciona **siempre por `value`, nunca por texto**: las etiquetas del portal
 * llevan espacios sobrantes distintos en cada página. `false` si la opción no
 * existe, lo que significa que la cascada aún no se pobló.
 */
export function setSelect(el: HTMLSelectElement, value: string): boolean {
  const option = [...el.options].find((o) => o.value.trim() === value);
  if (!option) return false;

  el.value = option.value;
  fire(el, 'change');
  fire(el, 'input');
  return true;
}

export interface WaitOptions {
  /** Nodo a observar. Cuanto más acotado, menos ruido. */
  root?: Node;
  timeout?: number;
  /** Intervalo del sondeo de respaldo, en ms. */
  pollMs?: number;
}

/**
 * Espera a que un predicado se cumpla, combinando `MutationObserver`, sondeo y
 * plazo máximo. Nunca un `setTimeout` a secas: no sabemos cuánto tarda Angular.
 */
export function waitFor<T>(predicate: () => T | null | false | undefined, options: WaitOptions = {}): Promise<T | null> {
  const { root = document.body, timeout = 5000, pollMs = 100 } = options;

  const immediate = predicate();
  if (immediate) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let done = false;

    const finish = (value: T | null) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearInterval(poller);
      clearTimeout(timer);
      resolve(value);
    };

    const check = () => {
      const value = predicate();
      if (value) finish(value);
    };

    const observer = new MutationObserver(check);
    const poller = setInterval(check, pollMs);
    const timer = setTimeout(() => finish(null), timeout);

    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    check();
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Un click «de verdad»: ng-select y Bootstrap escuchan `mousedown`, no solo `click`. */
export function realClick(el: Element): void {
  for (const type of ['mousedown', 'mouseup', 'click'] as const) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}

export type NgSelectOutcome = 'ok' | 'notFound' | 'disabled';

/**
 * Elige una opción en un `<ng-select>`. No hay control nativo debajo y el panel
 * solo existe mientras está abierto, así que la única vía desde el mundo
 * aislado es imitar a una persona: abrir, escribir, esperar y hacer click.
 *
 * @param code   el valor del control, p. ej. `71102`
 * @param label  lo que se ve, p. ej. `71102 - Servicios de ingeniería`
 */
export async function setNgSelect(host: HTMLElement, code: string, label: string): Promise<NgSelectOutcome> {
  if (host.classList.contains('ng-select-disabled')) return 'disabled';

  const container = host.querySelector<HTMLElement>('.ng-select-container');
  if (!container) return 'notFound';
  realClick(container);

  // Nunca por el atributo `autocomplete`: ng-select lo rellena con un token
  // aleatorio distinto en cada instancia (`a5ba5d6e2fe4`, `a1e749b07f10`, …).
  const search = host.querySelector<HTMLInputElement>('.ng-input input[role="combobox"]');
  if (!search) {
    closeNgSelect(host);
    return 'notFound';
  }

  setNativeValue(search, code);
  search.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: code }));

  // El panel puede colgar de `host` o de `body`, y el listado quizá venga por red.
  const options = await waitFor<HTMLElement[]>(
    () => {
      const panel = host.querySelector('ng-dropdown-panel') ?? document.querySelector('ng-dropdown-panel');
      if (!panel) return null;
      const found = [...panel.querySelectorAll<HTMLElement>('.ng-option:not(.ng-option-disabled)')];
      return found.length > 0 ? found : null;
    },
    { timeout: 6000 },
  );

  if (!options) {
    closeNgSelect(host);
    return 'notFound';
  }

  const chosen = pickOption(options, code, label);
  if (!chosen) {
    closeNgSelect(host);
    return 'notFound';
  }

  realClick(chosen);

  // Un click que no prendió deja el `.ng-value-label` vacío.
  const settled = await waitFor(
    () => {
      const text = host.querySelector('.ng-value-label')?.textContent?.trim();
      return text ? text : null;
    },
    { root: host, timeout: 2000 },
  );

  if (!settled) {
    closeNgSelect(host);
    return 'notFound';
  }

  return 'ok';
}

function pickOption(options: HTMLElement[], code: string, label: string): HTMLElement | null {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const wantedLabel = norm(label);

  const byCode = options.find((o) => {
    const text = norm(o.textContent ?? '');
    return text.startsWith(`${code} -`) || text.startsWith(`${code} `) || text === code;
  });
  if (byCode) return byCode;

  const byLabel = options.find((o) => norm(o.textContent ?? '') === wantedLabel);
  if (byLabel) return byLabel;

  return options.length === 1 ? options[0]! : null;
}

/** Cierra el panel tras un fallo; abierto, tapa los campos siguientes. */
export function closeNgSelect(host: HTMLElement): void {
  const search = host.querySelector<HTMLInputElement>('.ng-input input[role="combobox"]');
  search?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', code: 'Escape', keyCode: 27 }));
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  search?.blur();
}
