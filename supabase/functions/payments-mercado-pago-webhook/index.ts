import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const MP_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const MP_TEST_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN");
const MP_ENVIRONMENT = (Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "production").trim().toLowerCase();
const MP_WEBHOOK_SECRET = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET")?.trim();
const MP_TEST_WEBHOOK_SECRET = Deno.env.get("MERCADO_PAGO_TEST_WEBHOOK_SECRET")?.trim();
const MP_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const MP_SIGNATURE_FUTURE_SKEW_MS = 60 * 1000;
const secretKey = SUPABASE_SECRET_KEYS.default;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function parseSignature(value: string | null) {
  const parts = Object.fromEntries((value ?? "").split(",").map((x) => x.trim().split("=", 2)));
  return { ts: parts.ts, v1: parts.v1 };
}
function isSignatureTimestampFresh(ts?: string, nowMs = Date.now()) {
  if (!ts || !/^[0-9]+$/.test(ts)) return false;
  const timestampValue = Number(ts);
  if (!Number.isSafeInteger(timestampValue)) return false;
  const timestampMs = timestampValue >= 1_000_000_000_000 ? timestampValue : timestampValue * 1000;
  if (!Number.isSafeInteger(timestampMs)) return false;
  const ageMs = nowMs - timestampMs;
  return ageMs <= MP_SIGNATURE_MAX_AGE_MS && ageMs >= -MP_SIGNATURE_FUTURE_SKEW_MS;
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
function mapChargeStatus(status: string) {
  if (status === "approved") return "paid";
  if (status === "processing") return "processing";
  if (status === "rejected") return "failed";
  if (["cancelled", "expired", "refunded"].includes(status)) return status;
  return "pending";
}
function amountToMinor(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}
async function computeHmac(manifest: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
}
async function validateHmac(input: { dataId: string; requestId: string | null; ts?: string; v1?: string; secret: string }) {
  if (!input.ts || !input.v1 || !isSignatureTimestampFresh(input.ts)) return false;
  const ids = [...new Set([input.dataId, /[a-zA-Z]/.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId])];
  for (const id of ids) {
    const manifest = `id:${id};${input.requestId ? `request-id:${input.requestId};` : ""}ts:${input.ts};`;
    if (constantTimeEqual(await computeHmac(manifest, input.secret), input.v1.toLowerCase())) return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!secretKey) return json({ error: "server_not_configured" }, 500);

  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const isTest = payload?.live_mode === false || (payload?.live_mode == null && MP_ENVIRONMENT === "test");
  const environment = isTest ? "test" : "production";
  const accessToken = isTest ? MP_TEST_ACCESS_TOKEN : MP_ACCESS_TOKEN;
  const candidateSecrets = [...new Set((isTest ? [MP_TEST_WEBHOOK_SECRET, MP_WEBHOOK_SECRET] : [MP_WEBHOOK_SECRET])
    .filter((v): v is string => Boolean(v)).map((v) => v.trim()).filter(Boolean))];

  const url = new URL(req.url);
  const queryDataId = url.searchParams.get("data.id") ?? url.searchParams.get("data_id");
  const payloadDataId = payload?.data?.id != null ? String(payload.data.id) : null;
  const dataId = queryDataId ?? payloadDataId;
  const topic = payload?.type ?? url.searchParams.get("type");
  if (topic !== "order") return json({ ok: true, ignored: "unsupported_topic", environment }, 202);
  if (!dataId) return json({ error: "missing_resource_id" }, 400);

  const requestId = req.headers.get("x-request-id");
  const { ts, v1 } = parseSignature(req.headers.get("x-signature"));
  let signatureValid = false;
  for (const secret of candidateSecrets) {
    if (await validateHmac({ dataId, requestId, ts, v1, secret })) { signatureValid = true; break; }
  }

  if (dataId === "123456" && payload?.action === "order.processed" && payload?.data?.external_reference === "ext_ref_1234") {
    if (!signatureValid) return json({ error: "simulation_requires_signature" }, 401);
    return json({ ok: true, simulated: true, signature_valid: true, auth_method: "hmac", environment });
  }

  if (!accessToken) return json({ error: "server_not_configured", environment }, 500);

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const providerResponse = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`, {
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
  });
  const mp = await providerResponse.json().catch(() => ({}));

  if (!providerResponse.ok) {
    if (!signatureValid) {
      console.error("mp_webhook_unverified_provider_resource", JSON.stringify({ environment, status: providerResponse.status, data_id_kind: /[a-zA-Z]/.test(dataId) ? "alphanumeric" : "numeric" }));
      return json({ error: "unverified_provider_resource", environment }, 401);
    }
    if ([400, 404].includes(providerResponse.status)) return json({ ok: true, ignored: "provider_resource_not_found", signature_valid: true, environment }, 202);
    return json({ error: "provider_order_lookup_failed", status: providerResponse.status, environment }, 502);
  }

  const { data: attempt, error: attemptError } = await admin.from("payment_attempts")
    .select("id,tenant_id,charge_id,amount_minor,method")
    .eq("provider", "mercado_pago").eq("provider_order_id", dataId).maybeSingle();
  if (attemptError) return json({ error: "attempt_lookup_failed", details: attemptError.message }, 500);
  if (!attempt) {
    if (!signatureValid) return json({ error: "unverified_unknown_provider_order", environment }, 401);
    return json({ ok: true, ignored: "unknown_provider_order", signature_valid: true, environment }, 202);
  }

  const { data: charge, error: chargeError } = await admin.from("payment_charges")
    .select("id,order_id,tenant_id,amount_minor,currency,external_reference")
    .eq("id", attempt.charge_id).maybeSingle();
  if (chargeError || !charge) return json({ error: "charge_lookup_failed", details: chargeError?.message }, 500);

  const payment = mp?.transactions?.payments?.[0] ?? {};
  const providerExternalReference = mp?.external_reference != null ? String(mp.external_reference) : null;
  const providerAmountMinor = amountToMinor(payment?.amount ?? mp?.total_amount);
  const providerCurrency = mp?.currency != null ? String(mp.currency).trim().toUpperCase() : null;
  const providerMethodId = payment?.payment_method?.id != null ? String(payment.payment_method.id).trim().toLowerCase() : null;
  const providerMethodType = payment?.payment_method?.type != null ? String(payment.payment_method.type).trim().toLowerCase() : null;
  const providerOrderMatches = mp?.id != null && String(mp.id) === dataId;
  const tenantMatches = attempt.tenant_id === charge.tenant_id;
  const localAmountMatches = Number(attempt.amount_minor) === Number(charge.amount_minor);
  const providerAmountMatches = providerAmountMinor != null && providerAmountMinor === Number(charge.amount_minor);
  const currencyMatches = Boolean(providerCurrency && String(charge.currency).trim().toUpperCase() === providerCurrency);
  const referenceMatches = Boolean(providerExternalReference && charge.external_reference && providerExternalReference === charge.external_reference);
  const methodMatches = String(attempt.method).toLowerCase() === "pix" && providerMethodId === "pix" && providerMethodType === "bank_transfer";
  const providerCorrelationValid = providerOrderMatches && tenantMatches && localAmountMatches && providerAmountMatches && currencyMatches && referenceMatches && methodMatches;

  if (!providerCorrelationValid) {
    console.error("mp_webhook_provider_verification_failed", JSON.stringify({
      environment,
      signature_valid: signatureValid,
      provider_order_matches: providerOrderMatches,
      tenant_matches: tenantMatches,
      local_amount_matches: localAmountMatches,
      provider_amount_matches: providerAmountMatches,
      currency_matches: currencyMatches,
      reference_matches: referenceMatches,
      method_matches: methodMatches,
      has_provider_reference: Boolean(providerExternalReference),
    }));
    return json({ error: signatureValid ? "provider_correlation_mismatch" : "provider_verification_failed", environment }, signatureValid ? 409 : 401);
  }

  const authMethod = signatureValid ? "hmac" : "provider_lookup";
  if (!signatureValid) console.warn("mp_qr_webhook_verified_by_provider_lookup", JSON.stringify({ environment, auth_method: authMethod }));

  const eventId = payload?.id != null ? String(payload.id) : `${dataId}:${ts ?? "provider"}`;
  const { data: duplicate } = await admin.from("payment_events").select("id,processed_at")
    .eq("provider", "mercado_pago").eq("provider_event_id", eventId).maybeSingle();
  if (duplicate?.processed_at) return json({ ok: true, duplicate: true, signature_valid: signatureValid, auth_method: authMethod, environment });

  const providerStatus = payment?.status ?? mp?.status ?? null;
  const providerStatusDetail = payment?.status_detail ?? mp?.status_detail ?? null;
  const attemptStatus = mapAttemptStatus(providerStatus, providerStatusDetail);
  const chargeStatus = mapChargeStatus(attemptStatus);
  const now = new Date().toISOString();

  if (!duplicate) {
    const { error } = await admin.from("payment_events").insert({
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
    });
    if (error && error.code !== "23505") return json({ error: "event_insert_failed", details: error.message }, 500);
  }

  const attemptPatch: any = {
    status: attemptStatus,
    provider_payment_id: payment?.id ?? null,
    provider_status: providerStatus,
    provider_status_detail: providerStatusDetail,
    response_snapshot: mp,
  };
  if (attemptStatus === "approved") attemptPatch.approved_at = now;
  const { error: updateAttemptError } = await admin.from("payment_attempts").update(attemptPatch).eq("id", attempt.id);
  if (updateAttemptError) return json({ error: "attempt_update_failed", details: updateAttemptError.message }, 500);

  const chargePatch: any = { status: chargeStatus, provider_order_id: dataId };
  if (chargeStatus === "paid") { chargePatch.paid_amount_minor = attempt.amount_minor; chargePatch.paid_at = now; }
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
    const { error: sessionError } = await admin.from("public_checkout_sessions")
      .update({ status: "consumed", updated_at: now })
      .eq("order_id", charge.order_id)
      .eq("status", "active");
    if (sessionError) return json({ error: "checkout_session_consume_failed", details: sessionError.message }, 500);
  }

  await admin.from("payment_events").update({ processed_at: now, processing_error: null })
    .eq("provider", "mercado_pago").eq("provider_event_id", eventId);
  return json({ ok: true, provider_order_id: dataId, status: chargeStatus, provider_status: providerStatus, provider_status_detail: providerStatusDetail, signature_valid: signatureValid, auth_method: authMethod, environment });
});
