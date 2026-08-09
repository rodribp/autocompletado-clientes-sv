// SPDX-License-Identifier: MIT
//
// Content script: enrutador de mensajes. La lógica está en `forms/`, y aquí no
// se inicia nada por cuenta propia: se espera a que pidan algo.

import {
  err,
  ok,
  respondAsync,
  sendToBackground,
  type DiagnoseResult,
  type Envelope,
  type FieldKey,
  type FormType,
  type Res,
  type ToContentKind,
} from '../common/messages.js';
import type { Customer } from '../common/types.js';
import { captureReceptor, harvestCatalog } from './forms/capture.js';
import { detectFormType, receptorRoot, q } from './forms/detect.js';
import { FillError, fillReceptor, schemaFor } from './forms/fill.js';

chrome.runtime.onMessage.addListener(
  respondAsync(async (message: Envelope<string, unknown>): Promise<Res<unknown>> => {
    const formType = detectFormType();

    switch (message.kind as ToContentKind) {
      case 'PING':
        return ok({ formType, ready: formType !== null && receptorRoot(formType) !== null });

      case 'FILL_RECEPTOR': {
        if (!formType) return err('PAGE_NOT_SUPPORTED', 'Esta página no es una factura ni un crédito fiscal.');
        const { customer } = message.payload as { customer: Customer };
        if (!customer) return err('BAD_REQUEST', 'Falta el cliente.');

        try {
          const report = await fillReceptor(customer, formType);
          // Aprovechamos que el portal acaba de renderizar las listas.
          void pushCatalog(formType);
          return ok(report);
        } catch (error) {
          if (error instanceof FillError) return err(error.code, error.message);
          throw error;
        }
      }

      case 'CAPTURE_RECEPTOR': {
        if (!formType) return err('PAGE_NOT_SUPPORTED', 'Esta página no es una factura ni un crédito fiscal.');
        void pushCatalog(formType);
        return ok(captureReceptor(formType));
      }

      case 'HARVEST_CATALOG': {
        if (!formType) return err('PAGE_NOT_SUPPORTED', 'Esta página no es una factura ni un crédito fiscal.');
        return ok(harvestCatalog(formType));
      }

      case 'DIAGNOSE': {
        if (!formType) return err('PAGE_NOT_SUPPORTED', 'Esta página no es una factura ni un crédito fiscal.');
        return ok(diagnose(formType));
      }

      default:
        return err('BAD_REQUEST', `Mensaje desconocido: ${message.kind}`);
    }
  }),
);

/** Qué campos del esquema se resuelven de verdad. Lo primero a mirar si el portal cambia. */
function diagnose(formType: FormType): DiagnoseResult {
  const root = receptorRoot(formType);
  const schema = schemaFor(formType);
  const found: FieldKey[] = [];
  const missing: FieldKey[] = [];

  for (const field of schema.fields) {
    if (!field.control) continue; // el campo diferido de CF no se puede diagnosticar en frío
    const el = root ? q(root, field.control) : null;
    (el ? found : missing).push(field.key);
  }

  return { formType, found, missing };
}

/** Envía al background lo aprendido del catálogo territorial, sin bloquear. */
async function pushCatalog(formType: FormType): Promise<void> {
  try {
    const delta = harvestCatalog(formType);
    if (!delta.municipios && !delta.distritos) return;
    await sendToBackground('PUT_CATALOG', delta);
  } catch {
    // Aprender el catálogo es un extra: que falle no debe afectar al relleno.
  }
}
