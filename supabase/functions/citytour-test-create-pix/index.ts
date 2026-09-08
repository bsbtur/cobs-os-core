import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SECRET_KEY = SECRET_KEYS.default;
const MP_TEST_TOKEN = Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN");
const OPERATION_CODE = "CITYTO-QA-CLEAN-20260828-01";
const FIXTURE_KEY = "citytour-r1-contract-gates-v1";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
function mapStatus(status?: string, detail?: string) {
  if (status === "approved" || (status === "processed" && detail === "accredited")) return "approved";
  if (status === "processed" || status === "processing") return "processing";
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "refunded") return "refunded";
  if (status === "rejected") return "rejected";
  return "pending";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SECRET_KEY || !MP_TEST_TOKEN) return json({ error: "test_payment_not_configured" }, 500);

  let input: { order_id?: string; checkout_token?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const orderId = (input.order_id ?? "").trim();
  const checkoutToken = (input.checkout_token ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "invalid_order_id" }, 400);
  if (!/^[0-9a-f]{64}$/i.test(checkoutToken)) return json({ error: "invalid_checkout_token" }, 400);

  const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  const tokenHash = await sha256(checkoutToken);
  const nowIso = new Date().toISOString();

  const { data: session, error: sessionError } = await db
    .from("public_checkout_sessions")
    .select("id,tenant_id,order_id,status,expires_at")
    .eq("order_id", orderId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (sessionError) return json({ error: "checkout_session_lookup_failed" }, 500);
  if (!session) return json({ error: "invalid_checkout_session" }, 403);
  if (session.status !== "active") return json({ error: "checkout_session_not_active" }, 409);
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await db.from("public_checkout_sessions").update({ status: "expired", updated_at: nowIso }).eq("id", session.id);
    return json({ error: "checkout_session_expired" }, 409);
  }

  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id,tenant_id,operation_id,status,currency,grand_total_minor,metadata")
    .eq("id", orderId)
    .eq("tenant_id", session.tenant_id)
    .maybeSingle();
  if (orderError) return json({ error: "order_lookup_failed" }, 500);
  if (!order) return json({ error: "order_not_found" }, 404);
  if (!["submitted", "confirmed"].includes(order.status)) return json({ error: "order_not_payable", status: order.status }, 409);
  if (order.currency !== "BRL" || Number(order.grand_total_minor) !== 100) return json({ error: "unexpected_test_order_total" }, 409);
  const orderMetadata = (order.metadata ?? {}) as Record<string, unknown>;
  if (
    orderMetadata.qa_public_checkout !== true ||
    orderMetadata.qa_environment !== "test" ||
    orderMetadata.qa_fixture_key !== FIXTURE_KEY
  ) return json({ error: "order_not_citytour_test_fixture" }, 409);

  const { data: operation } = await db
    .from("operations")
    .select("code,archived_at")
    .eq("id", order.operation_id)
    .eq("tenant_id", order.tenant_id)
    .maybeSingle();
  if (!operation || operation.code !== OPERATION_CODE || operation.archived_at) return json({ error: "order_operation_mismatch" }, 409);

  const { data: item, error: itemError } = await db
    .from("order_items")
    .select("id,sellable_id,price_id,unit_amount_minor,quantity,metadata")
    .eq("order_id", order.id)
    .eq("tenant_id", order.tenant_id)
    .maybeSingle();
  if (itemError || !item) return json({ error: "order_item_required" }, 409);
  if (Number(item.unit_amount_minor) !== 100 || Number(item.quantity) !== 1 || item.metadata?.qa_fixture_key !== FIXTURE_KEY)
    return json({ error: "order_item_fixture_mismatch" }, 409);

  const { data: price } = await db
    .from("prices")
    .select("id,unit_amount_minor,currency,metadata")
    .eq("id", item.price_id)
    .eq("sellable_id", item.sellable_id)
    .eq("tenant_id", order.tenant_id)
    .maybeSingle();
  if (!price || Number(price.unit_amount_minor) !== 100 || price.currency !== "BRL" || price.metadata?.environment !== "test" || price.metadata?.qa_fixture_key !== FIXTURE_KEY)
    return json({ error: "test_price_mismatch" }, 409);

  const { data: facts, error: factsError } = await db
    .from("financial_facts")
    .select("fact_type,amount_minor")
    .eq("order_id", order.id);
  if (factsError) return json({ error: "financial_facts_lookup_failed" }, 500);
  let paid = 0;
  for (const fact of facts ?? []) {
    const amount = Number(fact.amount_minor ?? 0);
    if (fact.fact_type === "PAYMENT_RECORDED") paid += amount;
    if (fact.fact_type === "PAYMENT_REVERSED" || fact.fact_type === "REFUND_RECORDED") paid -= amount;
  }
  if (paid >= 100) return json({ error: "order_has_no_outstanding_balance" }, 409);

  const reservationResult = await db.rpc("ensure_order_reservation_for_payment", { _order_id: order.id });
  if (reservationResult.error) return json({ error: "reservation_prepare_failed", details: reservationResult.error.message }, 500);
  const reservationId = reservationResult.data?.reservation_id ?? null;

  const { data: openCharges, error: chargeLookupError } = await db
    .from("payment_charges")
    .select("*")
    .eq("order_id", order.id)
    .eq("provider", "mercado_pago")
    .in("status", ["draft", "pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (chargeLookupError) return json({ error: "charge_lookup_failed" }, 500);
  let charge = (openCharges ?? []).find((candidate: any) => candidate?.metadata?.environment === "test" && candidate?.metadata?.qa_fixture_key === FIXTURE_KEY) ?? null;
  if (charge && String(charge.external_reference ?? "").length > 64) {
    const retired = await db
      .from("payment_charges")
      .update({ status: "cancelled" })
      .eq("id", charge.id)
      .eq("status", "draft");
    if (retired.error) return json({ error: "invalid_charge_retire_failed", details: retired.error.message }, 500);
    charge = null;
  }
  if (!charge) {
    const reference = `cobs_ctqa_${String(order.id).replaceAll("-", "")}_${Date.now()}`;
    const created = await db
      .from("payment_charges")
      .insert({
        tenant_id: order.tenant_id,
        order_id: order.id,
        reservation_id: reservationId,
        provider: "mercado_pago",
        status: "draft",
        currency: "BRL",
        amount_minor: 100,
        installment_number: 1,
        installment_count: 1,
        external_reference: reference,
        description: "City Tour Brasília — QA R$ 1,00",
        metadata: { environment: "test", source: "citytour_test_checkout", qa: true, qa_fixture_key: FIXTURE_KEY },
      })
      .select("*")
      .single();
    if (created.error) return json({ error: "charge_create_failed", details: created.error.message }, 500);
    charge = created.data;
  }
  if (Number(charge.amount_minor) !== 100 || charge?.metadata?.environment !== "test") return json({ error: "charge_environment_mismatch" }, 409);

  const { data: openAttempts, error: attemptLookupError } = await db
    .from("payment_attempts")
    .select("*")
    .eq("charge_id", charge.id)
    .eq("provider", "mercado_pago")
    .eq("method", "pix")
    .in("status", ["created", "pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (attemptLookupError) return json({ error: "attempt_lookup_failed" }, 500);
  let attempt = (openAttempts ?? []).find((candidate: any) => candidate?.metadata?.environment === "test") ?? null;
  if (attempt?.provider_order_id && (attempt.pix_qr_code || attempt.pix_ticket_url)) {
    return json({
      order_id: order.id,
      charge_id: charge.id,
      attempt_id: attempt.id,
      amount_minor: 100,
      status: attempt.status,
      pix: { qr_code: attempt.pix_qr_code, qr_code_base64: attempt.pix_qr_code_base64, ticket_url: attempt.pix_ticket_url },
      reused: true,
      environment: "test",
    });
  }

  if (!attempt) {
    const idempotencyKey = crypto.randomUUID();
    const requestSnapshot = {
      type: "online",
      total_amount: "1.00",
      external_reference: charge.external_reference,
      processing_mode: "automatic",
      transactions: { payments: [{ amount: "1.00", payment_method: { id: "pix", type: "bank_transfer" } }] },
      payer: { email: "test_user_br@testuser.com", first_name: "APRO" },
    };
    const created = await db
      .from("payment_attempts")
      .insert({
        tenant_id: order.tenant_id,
        charge_id: charge.id,
        provider: "mercado_pago",
        method: "pix",
        status: "created",
        amount_minor: 100,
        idempotency_key: idempotencyKey,
        request_snapshot: requestSnapshot,
        metadata: { environment: "test", source: "citytour_test_checkout", qa: true, qa_fixture_key: FIXTURE_KEY },
      })
      .select("*")
      .single();
    if (created.error) return json({ error: "attempt_create_failed", details: created.error.message }, 500);
    attempt = created.data;
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${MP_TEST_TOKEN}`,
        "x-idempotency-key": attempt.idempotency_key,
      },
      body: JSON.stringify(attempt.request_snapshot),
    });
  } catch {
    return json({ error: "mercado_pago_network_error", attempt_id: attempt.id }, 502);
  }

  const provider = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok) {
    await db.from("payment_attempts").update({ status: "rejected", provider_status: "request_error", response_snapshot: provider }).eq("id", attempt.id);
    return json({ error: "mercado_pago_test_error", status: providerResponse.status, attempt_id: attempt.id }, 502);
  }

  const payment = provider?.transactions?.payments?.[0] ?? {};
  const method = payment?.payment_method ?? {};
  const providerStatus = payment?.status ?? provider?.status ?? null;
  const providerDetail = payment?.status_detail ?? provider?.status_detail ?? null;
  const attemptStatus = mapStatus(providerStatus, providerDetail);
  const completedAt = new Date().toISOString();

  await db
    .from("payment_attempts")
    .update({
      status: attemptStatus,
      provider_order_id: provider?.id ?? null,
      provider_payment_id: payment?.id ?? null,
      provider_status: providerStatus,
      provider_status_detail: providerDetail,
      pix_qr_code: method?.qr_code ?? null,
      pix_qr_code_base64: method?.qr_code_base64 ?? null,
      pix_ticket_url: method?.ticket_url ?? null,
      response_snapshot: provider,
      ...(attemptStatus === "approved" ? { approved_at: completedAt } : {}),
    })
    .eq("id", attempt.id);

  const chargeStatus = attemptStatus === "approved" ? "paid" : attemptStatus === "processing" ? "processing" : "pending";
  await db
    .from("payment_charges")
    .update({
      status: chargeStatus,
      provider_order_id: provider?.id ?? null,
      ...(chargeStatus === "paid" ? { paid_amount_minor: 100, paid_at: completedAt } : {}),
    })
    .eq("id", charge.id);

  let confirmation: unknown = null;
  if (chargeStatus === "paid") {
    const providerReference = `mercado_pago:${payment?.id ?? provider?.id}`;
    const recorded = await db.rpc("record_provider_payment", {
      _order_id: order.id,
      _amount_minor: 100,
      _reference: providerReference,
      _reason: "City Tour R$1 Golden Path TEST approved",
      _occurred_at: payment?.date_approved ?? provider?.last_updated_date ?? completedAt,
    });
    if (recorded.error) return json({ error: "financial_fact_failed", details: recorded.error.message }, 500);

    const confirmed = await db.rpc("confirm_paid_provider_order", {
      _order_id: order.id,
      _charge_id: charge.id,
      _provider_reference: providerReference,
    });
    if (confirmed.error) return json({ error: "provider_confirmation_failed", details: confirmed.error.message }, 500);
    confirmation = confirmed.data;

    await db.from("public_checkout_sessions").update({ status: "consumed", updated_at: completedAt }).eq("id", session.id);
  }

  return json(
    {
      order_id: order.id,
      charge_id: charge.id,
      attempt_id: attempt.id,
      amount_minor: 100,
      status: attemptStatus,
      confirmation,
      pix: { qr_code: method?.qr_code ?? null, qr_code_base64: method?.qr_code_base64 ?? null, ticket_url: method?.ticket_url ?? null },
      reused: false,
      environment: "test",
    },
    201,
  );
});
