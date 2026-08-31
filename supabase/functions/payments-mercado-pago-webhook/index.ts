import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = SUPABASE_SECRET_KEYS.default;

const MP_ENVIRONMENT = (Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "production").trim().toLowerCase();
const MP_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const MP_TEST_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN");
const MP_WEBHOOK_SECRET = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET")?.trim();
const MP_TEST_WEBHOOK_SECRET = Deno.env.get("MERCADO_PAGO_TEST_WEBHOOK_SECRET")?.trim();

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

function mapAttemptStatus(status?: string, detail?: string) {
  if (status === "approved" || (status === "processed" && detail === "accredited")) return "approved";
  if (status === "processed" || status === "processing") return "processing";
  if (status === "action_required") return "pending";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "refunded") return "refunded";
  if (status === "rejected" || status === "failed") return "rejected";
  return "pending";
}

function mapChargeStatus(attemptStatus: string) {
  if (attemptStatus === "approved") return "paid";
  if (attemptStatus === "processing") return "processing";
  if (attemptStatus === "rejected") return "failed";
  if (["cancelled", "expired", "refunded"].includes(attemptStatus)) return attemptStatus;
  return "pending";
}

async function computeHmac(manifest: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
}

async function validateSignature(input: {
  dataId: string;
  requestId: string | null;
  ts: string;
  v1: string;
  secret: string;
}) {
  const ids = [...new Set([
    input.dataId,
    /[a-zA-Z]/.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId,
  ])];

  for (const id of ids) {
    const manifest = `id:${id};${input.requestId ? `request-id:${input.requestId};` : ""}ts:${input.ts};`;
    const expected = await computeHmac(manifest, input.secret);
    if (constantTimeEqual(expected, input.v1.toLowerCase())) return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const isTest = MP_ENVIRONMENT === "test";
  const accessToken = isTest ? MP_TEST_ACCESS_TOKEN : MP_ACCESS_TOKEN;
  if (!secretKey || !accessToken) {
    return json({ error: "server_not_configured", environment: isTest ? "test" : "production" }, 500);
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const url = new URL(req.url);
  const topic = payload?.type ?? url.searchParams.get("type");
  const queryDataId = url.searchParams.get("data.id") ?? url.searchParams.get("data_id");
  const payloadDataId = payload?.data?.id != null ? String(payload.data.id) : null;
  const dataId = queryDataId ?? payloadDataId;
  if (!dataId) return json({ error: "missing_resource_id" }, 400);

  const requestId = req.headers.get("x-request-id");
  const { ts, v1 } = parseSignature(req.headers.get("x-signature"));
  const candidateSecrets = [...new Set(
    (isTest ? [MP_TEST_WEBHOOK_SECRET, MP_WEBHOOK_SECRET] : [MP_WEBHOOK_SECRET])
      .filter((v): v is string => Boolean(v))
      .map((v) => v.trim())
      .filter(Boolean),
  )];

  let signatureValid = false;
  if (ts && v1 && candidateSecrets.length > 0) {
    for (const secret of candidateSecrets) {
      if (await validateSignature({ dataId, requestId, ts, v1, secret })) {
        signatureValid = true;
        break;
      }
    }
  }

  if (topic !== "order") {
    if (!signatureValid) return json({ error: "invalid_signature" }, 401);
    return json({ ok: true, ignored: "unsupported_topic", signature_valid: true }, 202);
  }

  const isSimulatorSample = dataId === "123456" && payload?.action === "order.processed" && payload?.data?.external_reference === "ext_ref_1234";
  if (isSimulatorSample) {
    if (!signatureValid) return json({ error: "invalid_signature" }, 401);
    return json({ ok: true, simulated: true, signature_valid: true }, 200);
  }

  // Mercado Pago documents that QR-code notifications cannot always be authenticated
  // through the secret signature. For order/Pix notifications we therefore never trust
  // the webhook payload as payment truth when HMAC fails. We re-fetch the order from
  // Mercado Pago with our access token and only process it if it maps to a provider
  // order that COBS already created locally.
  const providerResponse = await fetch(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`,
    { headers: { accept: "application/json", authorization: `Bearer ${accessToken}` } },
  );
  const mp = await providerResponse.json().catch(() => ({}));

  if (!providerResponse.ok) {
    if ([400, 404].includes(providerResponse.status)) {
      return json({
        ok: true,
        ignored: "provider_resource_not_found",
        signature_valid: signatureValid,
        origin_verified: false,
      }, 202);
    }
    return json({ error: "provider_order_lookup_failed", status: providerResponse.status }, 502);
  }

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const { data: attempt, error: attemptError } = await admin
    .from("payment_attempts")
    .select("id,tenant_id,charge_id,amount_minor")
    .eq("provider", "mercado_pago")
    .eq("provider_order_id", dataId)
    .maybeSingle();

  if (attemptError) return json({ error: "attempt_lookup_failed", details: attemptError.message }, 500);
  if (!attempt) {
    return json({
      ok: true,
      ignored: "unknown_provider_order",
      signature_valid: signatureValid,
      origin_verified: true,
    }, 202);
  }

  const { data: charge, error: chargeError } = await admin
    .from("payment_charges")
    .select("id,order_id,tenant_id,amount_minor")
    .eq("id", attempt.charge_id)
    .maybeSingle();
  if (chargeError || !charge) return json({ error: "charge_lookup_failed", details: chargeError?.message }, 500);

  const eventId = payload?.id != null
    ? String(payload.id)
    : `${dataId}:${ts ?? payload?.date_created ?? "provider"}`;
  const { data: duplicate } = await admin
    .from("payment_events")
    .select("id,processed_at")
    .eq("provider", "mercado_pago")
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (duplicate?.processed_at) {
    return json({
      ok: true,
      duplicate: true,
      signature_valid: signatureValid,
      origin_verified: true,
    });
  }

  const payment = mp?.transactions?.payments?.[0] ?? {};
  const providerStatus = payment?.status ?? mp?.status ?? null;
  const providerStatusDetail = payment?.status_detail ?? mp?.status_detail ?? null;
  const attemptStatus = mapAttemptStatus(providerStatus, providerStatusDetail);
  const chargeStatus = mapChargeStatus(attemptStatus);
  const now = new Date().toISOString();

  if (!duplicate) {
    const { error: eventError } = await admin.from("payment_events").insert({
      tenant_id: attempt.tenant_id,
      charge_id: attempt.charge_id,
      attempt_id: attempt.id,
      provider: "mercado_pago",
      event_type: payload?.action ?? "order.updated",
      provider_event_id: eventId,
      provider_resource_id: dataId,
      signature_valid: signatureValid,
      payload,
      occurred_at: payload?.date_created ?? null,
      processing_error: signatureValid ? null : "origin_verified_via_provider_api",
    });
    if (eventError && eventError.code !== "23505") {
      return json({ error: "event_insert_failed", details: eventError.message }, 500);
    }
  }

  const attemptPatch: Record<string, unknown> = {
    status: attemptStatus,
    provider_payment_id: payment?.id ?? null,
    provider_status: providerStatus,
    provider_status_detail: providerStatusDetail,
    response_snapshot: mp,
  };
  if (attemptStatus === "approved") attemptPatch.approved_at = now;
  const { error: updateAttemptError } = await admin.from("payment_attempts").update(attemptPatch).eq("id", attempt.id);
  if (updateAttemptError) return json({ error: "attempt_update_failed", details: updateAttemptError.message }, 500);

  const chargePatch: Record<string, unknown> = { status: chargeStatus, provider_order_id: dataId };
  if (chargeStatus === "paid") {
    chargePatch.paid_amount_minor = attempt.amount_minor;
    chargePatch.paid_at = now;
  }
  if (chargeStatus === "cancelled") chargePatch.cancelled_at = now;
  const { error: updateChargeError } = await admin.from("payment_charges").update(chargePatch).eq("id", attempt.charge_id);
  if (updateChargeError) return json({ error: "charge_update_failed", details: updateChargeError.message }, 500);

  if (chargeStatus === "paid") {
    const reference = `mercado_pago:${payment?.id ?? dataId}`;
    const { error: factError } = await admin.rpc("record_provider_payment", {
      _order_id: charge.order_id,
      _amount_minor: attempt.amount_minor,
      _reference: reference,
      _reason: "Mercado Pago payment approved",
      _occurred_at: payment?.date_approved ?? mp?.last_updated_date ?? now,
    });
    if (factError) return json({ error: "financial_fact_failed", details: factError.message }, 500);

    const { error: confirmError } = await admin.rpc("confirm_paid_provider_order", {
      _order_id: charge.order_id,
      _charge_id: charge.id,
      _provider_reference: reference,
    });
    if (confirmError) return json({ error: "order_confirmation_failed", details: confirmError.message }, 500);
  }

  await admin.from("payment_events").update({
    processed_at: now,
    processing_error: signatureValid ? null : "origin_verified_via_provider_api",
  }).eq("provider", "mercado_pago").eq("provider_event_id", eventId);

  return json({
    ok: true,
    provider_order_id: dataId,
    status: chargeStatus,
    provider_status: providerStatus,
    provider_status_detail: providerStatusDetail,
    signature_valid: signatureValid,
    origin_verified: true,
    verification_method: signatureValid ? "hmac_and_provider_api" : "provider_api",
    environment: isTest ? "test" : "production",
  });
});
