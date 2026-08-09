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
import { captureRecipient, harvestCatalog } from './forms/capture.js';
import { detectFormType, recipientRoot, q } from './forms/detect.js';
import { FillError, fillRecipient, schemaFor } from './forms/fill.js';

chrome.runtime.onMessage.addListener(
  respondAsync(async (message: Envelope<string, unknown>): Promise<Res<unknown>> => {
    const formType = detectFormType();

    switch (message.kind as ToContentKind) {
      case 'PING':
        return ok({ formType, ready: formType !== null && recipientRoot(formType) !== null });

      case 'FILL_RECIPIENT': {
        if (!formType) return err('PAGE_NOT_SUPPORTED', 'Esta página no es una factura ni un crédito fiscal.');
        const { customer } = message.payload as { customer: Customer };
        if (!customer) return err('BAD_REQUEST', 'Falta el cliente.');

        try {
          const report = await fillRecipient(customer, formType);
          // The portal just rendered the lists, so harvest them now.
          void pushCatalog(formType);
          return ok(report);
        } catch (error) {
          if (error instanceof FillError) return err(error.code, error.message);
          throw error;
        }
      }

      case 'CAPTURE_RECIPIENT': {
        if (!formType) return err('PAGE_NOT_SUPPORTED', 'Esta página no es una factura ni un crédito fiscal.');
        void pushCatalog(formType);
        return ok(captureRecipient(formType));
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

function diagnose(formType: FormType): DiagnoseResult {
  const root = recipientRoot(formType);
  const schema = schemaFor(formType);
  const found: FieldKey[] = [];
  const missing: FieldKey[] = [];

  for (const field of schema.fields) {
    if (!field.control) continue; // CF's deferred doc-number field can't be checked before it renders
    const el = root ? q(root, field.control) : null;
    (el ? found : missing).push(field.key);
  }

  return { formType, found, missing };
}

async function pushCatalog(formType: FormType): Promise<void> {
  try {
    const delta = harvestCatalog(formType);
    if (!delta.municipalities && !delta.districts) return;
    await sendToBackground('PUT_CATALOG', delta);
  } catch {
    // The catalog is a bonus; a failure here must not affect filling.
  }
}
