import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * COBS OS · MP-01 — provider webhook receiver (structure only).
 *
 * No real Mercado Pago credentials are connected yet: this endpoint accepts a
 * signed provider notification, normalizes it, and delegates every financial
 * decision to public.record_provider_payment_event, which is the sole authority
 * and is idempotent on (provider, provider_event_id).
 */

const EVENT_TYPE_BY_STATUS: Record<string, string> = {
  pending: "PAYMENT_PENDING",
  in_process: "PAYMENT_PENDING",
  authorized: "PAYMENT_PENDING",
  approved: "PAYMENT_APPROVED",
  rejected: "PAYMENT_REJECTED",
  cancelled: "PAYMENT_CANCELLED",
  expired: "PAYMENT_EXPIRED",
  refunded: "PAYMENT_REFUNDED",
  charged_back: "PAYMENT_REFUNDED",
};

const payloadSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  type: z.string().max(60).optional(),
  action: z.string().max(60).optional(),
  data: z
    .object({
      id: z.string().min(1).max(120).optional(),
      status: z.string().min(1).max(60).optional(),
      status_detail: z.string().max(200).optional(),
      external_reference: z.string().max(120).optional(),
      transaction_amount: z.number().positive().max(1_000_000).optional(),
      date_approved: z.string().max(60).optional(),
    })
    .default({}),
});

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/payments/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["MP_WEBHOOK_SECRET"];
        if (!secret) {
          return Response.json({ error: "receiver_not_configured" }, { status: 503 });
        }
        const provided = request.headers.get("x-cobs-webhook-secret") ?? "";
        if (!timingSafeEqual(provided, secret)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "invalid_payload" }, { status: 400 });
        }

        const body = parsed.data;
        const status = body.data.status ?? "";
        const eventType = EVENT_TYPE_BY_STATUS[status];
        if (!eventType) {
          return Response.json({ recorded: false, reason: "unmapped_status" }, { status: 202 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Drop absent keys so optional RPC arguments stay absent, not explicit undefined.
        const args = Object.fromEntries(
          Object.entries({
            _provider: "mercadopago",
            _event_type: eventType,
            _external_reference: body.data.external_reference,
            _provider_payment_id: body.data.id,
            _provider_event_id: body.id,
            _provider_status: status,
            _provider_status_detail: body.data.status_detail,
            _amount: body.data.transaction_amount,
            _payload: { action: body.action ?? null, type: body.type ?? null },
          }).filter(([, value]) => value !== undefined),
        ) as Parameters<typeof supabaseAdmin.rpc<"record_provider_payment_event">>[1];

        const { data, error } = await supabaseAdmin.rpc("record_provider_payment_event", args);

        if (error) {
          console.error("[MP-01] provider event rejected", error.message);
          return Response.json({ error: "record_failed" }, { status: 500 });
        }

        return Response.json(data, { status: 200 });
      },
    },
  },
});
