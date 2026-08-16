import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const MP_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const MP_WEBHOOK_SECRET = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET");
const secretKey = SUPABASE_SECRET_KEYS.default;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseSignature(value: string | null) {
  const parts = Object.fromEntries((value ?? "").split(",").map((p) => p.trim().split("=", 2)));
  return { ts: parts.ts, v1: parts.v1 };
}

function mapAttemptStatus(status?: string) {
  if (status === "approved") return "approved";
  if (status === "action_required") return "pending";
  if (status === "processing") return "processing";
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "refunded") return "refunded";
  if (status === "rejected") return "rejected";
  return "pending";
}

function mapChargeStatus(attemptStatus: string) {
  if (attemptStatus === "approved") return "paid";
  if (attemptStatus === "processing") return "processing";
  if (attemptStatus === "rejected") return "failed";
  if (["cancelled", "expired", "refunded"].includes(attemptStatus)) return attemptStatus;
  return "pending";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!secretKey || !MP_ACCESS_TOKEN) return json({ error: "server_not_configured" }, 500);
  if (!MP_WEBHOOK_SECRET) return json({ error: "webhook_secret_not_configured" }, 503);

  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("data_id");
  const requestId = req.headers.get("x-request-id");
  const { ts, v1 } = parseSignature(req.headers.get("x-signature"));

  if (!dataId || !requestId || !ts || !v1) return json({ error: "missing_signature_components" }, 401);

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(manifest));
  const expected = hex(digest);
  if (!constantTimeEqual(expected, v1.toLowerCase())) return json({ error: "invalid_signature" }, 401);

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if ((payload?.type ?? url.searchParams.get("type")) !== "order") {
    return json({ ok: true, ignored: "unsupported_topic" }, 202);
  }

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });

  const eventId = payload?.id != null ? String(payload.id) : `${dataId}:${ts}`;
  const { data: duplicate } = await admin
    .from("payment_events")
    .select("id,processed_at")
    .eq("provider", "mercado_pago")
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (duplicate) return json({ ok: true, duplicate: true });

  const orderResponse = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`, {
    headers: { accept: "application/json", authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  const mp = await orderResponse.json().catch(() => ({}));
  if (!orderResponse.ok) return json({ error: "provider_order_lookup_failed", status: orderResponse.status }, 502);

  const { data: attempt, error: attemptError } = await admin
    .from("payment_attempts")
    .select("id,tenant_id,charge_id,amount_minor")
    .eq("provider", "mercado_pago")
    .eq("provider_order_id", dataId)
    .maybeSingle();

  if (attemptError) return json({ error: "attempt_lookup_failed" }, 500);
  if (!attempt) return json({ ok: true, ignored: "unknown_provider_order" }, 202);

  const payment = mp?.transactions?.payments?.[0] ?? {};
  const providerStatus = payment?.status ?? mp?.status ?? null;
  const providerStatusDetail = payment?.status_detail ?? mp?.status_detail ?? null;
  const attemptStatus = mapAttemptStatus(providerStatus);
  const chargeStatus = mapChargeStatus(attemptStatus);
  const now = new Date().toISOString();

  const { error: eventError } = await admin.from("payment_events").insert({
    tenant_id: attempt.tenant_id,
    charge_id: attempt.charge_id,
    attempt_id: attempt.id,
    provider: "mercado_pago",
    event_type: payload?.action ?? "order.updated",
    provider_event_id: eventId,
    provider_resource_id: dataId,
    signature_valid: true,
    payload,
    occurred_at: payload?.date_created ?? null,
  });
  if (eventError && eventError.code !== "23505") return json({ error: "event_insert_failed" }, 500);
  if (eventError?.code === "23505") return json({ ok: true, duplicate: true });

  const attemptPatch: Record<string, unknown> = {
    status: attemptStatus,
    provider_payment_id: payment?.id ?? null,
    provider_status: providerStatus,
    provider_status_detail: providerStatusDetail,
    response_snapshot: mp,
  };
  if (attemptStatus === "approved") attemptPatch.approved_at = now;

  const { error: updateAttemptError } = await admin.from("payment_attempts").update(attemptPatch).eq("id", attempt.id);
  if (updateAttemptError) {
    await admin.from("payment_events").update({ processing_error: "attempt_update_failed" }).eq("provider", "mercado_pago").eq("provider_event_id", eventId);
    return json({ error: "attempt_update_failed" }, 500);
  }

  const chargePatch: Record<string, unknown> = { status: chargeStatus, provider_order_id: dataId };
  if (chargeStatus === "paid") {
    chargePatch.paid_amount_minor = attempt.amount_minor;
    chargePatch.paid_at = now;
  }
  if (chargeStatus === "cancelled") chargePatch.cancelled_at = now;

  const { error: updateChargeError } = await admin.from("payment_charges").update(chargePatch).eq("id", attempt.charge_id);
  if (updateChargeError) {
    await admin.from("payment_events").update({ processing_error: "charge_update_failed" }).eq("provider", "mercado_pago").eq("provider_event_id", eventId);
    return json({ error: "charge_update_failed" }, 500);
  }

  await admin
    .from("payment_events")
    .update({ processed_at: now, processing_error: null })
    .eq("provider", "mercado_pago")
    .eq("provider_event_id", eventId);

  return json({ ok: true, provider_order_id: dataId, status: chargeStatus });
});
