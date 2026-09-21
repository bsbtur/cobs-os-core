import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = KEYS.default;
const MP_ENV = (Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "production").trim().toLowerCase();
const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const MP_TEST_TOKEN = Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN");
const CIOSP_CODE = "CIOSP-SP-2027";
const ENTRY_MINOR = 349000;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-client-info, apikey, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(value: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
function mapStatus(status?: string, detail?: string) {
  if (status === "approved" || (status === "processed" && detail === "accredited")) return "approved";
  if (status === "processed" || status === "processing") return "processing";
  if (status === "rejected" || status === "failed") return "rejected";
  return "pending";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!secretKey) return json({ error: "server_not_configured" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const orderId = String(body?.order_id ?? "").trim();
  const checkoutToken = String(body?.checkout_token ?? "").trim();
  const cardToken = String(body?.card_token ?? "").trim();
  const paymentMethodId = String(body?.payment_method_id ?? "").trim().toLowerCase();
  const payerEmail = String(body?.payer_email ?? "").trim().toLowerCase();
  const installments = Number(body?.installments ?? 0);

  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[0-9a-f]{64}$/i.test(checkoutToken)) return json({ error: "invalid_checkout_proof" }, 400);
  if (!cardToken || cardToken.length > 256 || !paymentMethodId || !/^[a-z0-9_-]{2,40}$/.test(paymentMethodId)) return json({ error: "invalid_card_token" }, 400);
  if (!Number.isInteger(installments) || installments < 1 || installments > 12) return json({ error: "invalid_installments" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) return json({ error: "invalid_payer_email" }, 400);

  const db = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const hash = await sha256(checkoutToken);
  const { data: session } = await db.from("public_checkout_sessions").select("id,tenant_id,order_id,status,expires_at").eq("order_id", orderId).eq("token_hash", hash).maybeSingle();
  if (!session) return json({ error: "invalid_checkout_proof" }, 403);
  if (!["active", "consumed"].includes(session.status) || new Date(session.expires_at).getTime() <= Date.now()) return json({ error: "checkout_proof_not_active" }, 409);

  const { data: order } = await db.from("orders").select("id,tenant_id,operation_id,status,currency,grand_total_minor,metadata").eq("id", orderId).eq("tenant_id", session.tenant_id).maybeSingle();
  if (!order) return json({ error: "order_not_found" }, 404);
  const { data: operation } = await db.from("operations").select("code").eq("id", order.operation_id).maybeSingle();
  if (!operation || operation.code !== CIOSP_CODE) return json({ error: "order_not_canonical_ciosp" }, 409);

  const qa = order?.metadata?.qa_public_checkout === true;
  const environment = qa ? "test" : MP_ENV;
  const accessToken = environment === "test" ? MP_TEST_TOKEN : MP_TOKEN;
  if (!accessToken) return json({ error: "mercado_pago_not_configured" }, 500);

  const { data: facts, error: factsError } = await db.from("financial_facts").select("fact_type,amount_minor").eq("order_id", orderId);
  if (factsError) return json({ error: "financial_facts_lookup_failed" }, 500);
  let paid = 0;
  for (const fact of facts ?? []) {
    const amount = Number(fact.amount_minor ?? 0);
    if (fact.fact_type === "PAYMENT_RECORDED") paid += amount;
    if (fact.fact_type === "PAYMENT_REVERSED" || fact.fact_type === "REFUND_RECORDED") paid -= amount;
  }
  paid = Math.max(0, paid);
  const total = Number(order.grand_total_minor ?? 0);
  if (paid < ENTRY_MINOR) return json({ error: "entry_not_confirmed", paid_minor: paid }, 409);
  const balance = Math.max(total - paid, 0);
  if (balance <= 0) return json({ error: "order_has_no_outstanding_balance" }, 409);

  const { data: existing } = await db.from("payment_charges").select("id,status,amount_minor,provider_order_id,metadata").eq("order_id", orderId).eq("provider", "mercado_pago").eq("status", "paid").contains("metadata", { commercial_payment_stage: "card_balance" }).maybeSingle();
  if (existing) return json({ error: "card_balance_already_paid" }, 409);

  const externalReference = `cobs_${orderId.replaceAll("-", "")}_card_balance`;
  const { data: charge, error: chargeError } = await db.from("payment_charges").insert({
    tenant_id: order.tenant_id, order_id: orderId, provider: "mercado_pago", status: "draft", currency: "BRL",
    amount_minor: balance, installment_number: 2, installment_count: 2, external_reference: externalReference,
    description: "CIOSP 2027 — saldo no cartão",
    metadata: { environment, source: "public_checkout", commercial_payment_stage: "card_balance", provider_installments: installments },
  }).select("*").single();
  if (chargeError) return json({ error: "card_charge_create_failed", details: chargeError.message }, 500);

  const idempotencyKey = crypto.randomUUID();
  const { data: attempt, error: attemptError } = await db.from("payment_attempts").insert({
    tenant_id: order.tenant_id, charge_id: charge.id, provider: "mercado_pago", method: "card", status: "created",
    amount_minor: balance, idempotency_key: idempotencyKey,
    request_snapshot: { type: "online", total_amount: (balance / 100).toFixed(2), external_reference: externalReference, payment_method_id: paymentMethodId, installments, payer_email: payerEmail, card_token_present: true },
    metadata: { environment, source: "public_checkout", commercial_payment_stage: "card_balance" },
  }).select("*").single();
  if (attemptError) return json({ error: "card_attempt_create_failed", details: attemptError.message }, 500);

  const amount = (balance / 100).toFixed(2);
  const providerBody = {
    type: "online", processing_mode: "automatic", total_amount: amount, external_reference: externalReference,
    payer: { email: payerEmail },
    transactions: { payments: [{ amount, payment_method: { id: paymentMethodId, type: "credit_card", token: cardToken, installments } }] },
  };

  let response: Response;
  try {
    response = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${accessToken}`, "x-idempotency-key": idempotencyKey },
      body: JSON.stringify(providerBody),
    });
  } catch {
    await db.from("payment_attempts").update({ status: "rejected", provider_status: "network_error" }).eq("id", attempt.id);
    return json({ error: "mercado_pago_network_error" }, 502);
  }

  const mp = await response.json().catch(() => ({}));
  if (!response.ok) {
    await db.from("payment_attempts").update({ status: "rejected", provider_status: "request_error", response_snapshot: mp }).eq("id", attempt.id);
    await db.from("payment_charges").update({ status: "failed" }).eq("id", charge.id);
    return json({ error: "mercado_pago_card_error", status: response.status }, 502);
  }

  const payment = mp?.transactions?.payments?.[0] ?? {};
  const mapped = mapStatus(payment?.status ?? mp?.status, payment?.status_detail ?? mp?.status_detail);
  const now = new Date().toISOString();
  await db.from("payment_attempts").update({
    status: mapped, provider_order_id: mp?.id ?? null, provider_payment_id: payment?.id ?? null,
    provider_status: payment?.status ?? mp?.status ?? null, provider_status_detail: payment?.status_detail ?? mp?.status_detail ?? null,
    response_snapshot: mp, ...(mapped === "approved" ? { approved_at: now } : {}),
  }).eq("id", attempt.id);
  await db.from("payment_charges").update({
    status: mapped === "approved" ? "paid" : mapped === "processing" ? "processing" : mapped === "rejected" ? "failed" : "pending",
    provider_order_id: mp?.id ?? null, ...(mapped === "approved" ? { paid_amount_minor: balance, paid_at: now } : {}),
  }).eq("id", charge.id);

  if (mapped === "approved") {
    const reference = `mercado_pago:${payment?.id ?? mp?.id}`;
    const { error: factError } = await db.rpc("record_provider_payment", { _order_id: orderId, _amount_minor: balance, _reference: reference, _reason: "CIOSP 2027 card balance approved", _occurred_at: payment?.date_approved ?? now });
    if (factError) return json({ error: "financial_fact_failed", details: factError.message }, 500);
    const { error: confirmError } = await db.rpc("confirm_paid_provider_order", { _order_id: orderId, _charge_id: charge.id, _provider_reference: reference });
    if (confirmError) return json({ error: "order_confirmation_failed", details: confirmError.message }, 500);
  }

  return json({ order_id: orderId, charge_id: charge.id, attempt_id: attempt.id, amount_minor: balance, installments, status: mapped, provider_order_id: mp?.id ?? null, confirmed: mapped === "approved" }, 201);
});
