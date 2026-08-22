import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  createMercadoPagoProvider,
  toCanonicalProviderEvent,
  verifyMercadoPagoSignature,
} from "@/lib/payments-mp.server";

/**
 * Mercado Pago webhook receiver.
 *
 * The notification authenticates the trigger only. Financial status and amount
 * are always reconciled from Mercado Pago before a canonical COBS event is stored.
 */
const notificationSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  type: z.string().max(60).optional(),
  action: z.string().max(80).optional(),
  data: z.object({ id: z.union([z.string(), z.number()]).optional() }).default({}),
});

export const Route = createFileRoute("/api/public/payments/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookSecret = process.env["MP_WEBHOOK_SECRET"];
        if (!webhookSecret) {
          return Response.json({ error: "receiver_not_configured" }, { status: 503 });
        }

        const url = new URL(request.url);
        const queryDataId = url.searchParams.get("data.id") ?? url.searchParams.get("data_id");
        if (!queryDataId) {
          return Response.json({ error: "missing_data_id" }, { status: 400 });
        }

        const signatureOk = verifyMercadoPagoSignature({
          signatureHeader: request.headers.get("x-signature"),
          requestId: request.headers.get("x-request-id"),
          dataId: queryDataId,
          secret: webhookSecret,
        });
        if (!signatureOk) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const parsed = notificationSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "invalid_payload" }, { status: 400 });
        }

        const bodyDataId = parsed.data.data.id ? String(parsed.data.data.id) : null;
        if (bodyDataId && bodyDataId !== queryDataId) {
          return Response.json({ error: "data_id_mismatch" }, { status: 400 });
        }

        // Mercado Pago's Webhooks simulator can send a signed synthetic Order event
        // whose Data ID is not a real ORD... resource. Acknowledge that transport/
        // signature test without persisting financial state or calling the provider.
        if (parsed.data.type === "order" && !/^ORD[A-Z0-9]+$/i.test(queryDataId)) {
          return Response.json(
            { accepted: true, simulated: true, recorded: false, reason: "synthetic_order_id" },
            { status: 200 },
          );
        }

        const accessToken = process.env["MP_ACCESS_TOKEN"];
        if (!accessToken) {
          return Response.json({ error: "reconciliation_not_configured" }, { status: 503 });
        }

        const provider = createMercadoPagoProvider({ accessToken });
        const payment = await provider.getPayment(queryDataId);
        if (!payment || payment.provider_payment_id !== queryDataId) {
          return Response.json({ error: "reconciliation_failed" }, { status: 502 });
        }

        const canonical = toCanonicalProviderEvent(payment);
        if (!canonical) {
          return Response.json({ recorded: false, reason: "unmapped_status" }, { status: 202 });
        }
        if (payment.currency !== "BRL") {
          return Response.json({ error: "unsupported_currency" }, { status: 422 });
        }

        const providerEventId = parsed.data.id
          ? String(parsed.data.id)
          : request.headers.get("x-request-id");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("record_provider_payment_event", {
          _provider: "mercadopago",
          _event_type: canonical.eventType,
          _provider_payment_id: canonical.providerPaymentId,
          _provider_status: canonical.providerStatus,
          _amount: canonical.amount,
          _payload: {
            action: parsed.data.action ?? null,
            type: parsed.data.type ?? null,
            reconciled: true,
          },
          ...(canonical.externalReference
            ? { _external_reference: canonical.externalReference }
            : {}),
          ...(canonical.providerStatusDetail
            ? { _provider_status_detail: canonical.providerStatusDetail }
            : {}),
          ...(providerEventId ? { _provider_event_id: providerEventId } : {}),
          ...(canonical.occurredAt ? { _occurred_at: canonical.occurredAt } : {}),
        });

        if (error) {
          console.error("[MP-01] reconciled provider event rejected", error.message);
          return Response.json({ error: "record_failed" }, { status: 500 });
        }

        return Response.json(data, { status: 200 });
      },
    },
  },
});
