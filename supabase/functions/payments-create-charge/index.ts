import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEYS = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const MP_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const MP_ENVIRONMENT = Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "test";
const publishableKey = SUPABASE_PUBLISHABLE_KEYS.default;
const secretKey = SUPABASE_SECRET_KEYS.default;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" } });
}
function mapAttemptStatus(status?: string, detail?: string) {
  if (status === "approved") return "approved";
  if (status === "processed" && detail === "accredited") return "approved";
  if (status === "processed" || status === "processing") return "processing";
  if (status === "action_required") return "pending";
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "refunded") return "refunded";
  if (status === "rejected") return "rejected";
  return "pending";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!MP_ACCESS_TOKEN) return json({ error: "mercado_pago_not_configured" }, 500);
  if (!publishableKey || !secretKey) return json({ error: "supabase_keys_not_available" }, 500);

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);
  const userClient = createClient(SUPABASE_URL, publishableKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "invalid_session" }, 401);

  let input: { charge_id?: string; order_id?: string; payer_email?: string };
  try { input = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const requestedChargeId = input.charge_id?.trim();
  const orderId = input.order_id?.trim();
  const payerEmail = input.payer_email?.trim().toLowerCase();
  if (!requestedChargeId && !orderId) return json({ error: "charge_id_or_order_id_required" }, 400);
  if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) return json({ error: "valid_payer_email_required" }, 400);

  let charge: any = null;
  if (requestedChargeId) {
    const { data, error } = await admin.from("payment_charges").select("id,tenant_id,order_id,status,currency,amount_minor,external_reference,provider,provider_order_id").eq("id", requestedChargeId).maybeSingle();
    if (error) return json({ error: "charge_lookup_failed", details: error.message }, 500);
    if (!data) return json({ error: "charge_not_found" }, 404);
    charge = data;
  } else {
    const { data: order, error: orderError } = await admin.from("orders").select("id,tenant_id,status,currency,grand_total_minor,reference_label").eq("id", orderId).maybeSingle();
    if (orderError) return json({ error: "order_lookup_failed", details: orderError.message }, 500);
    if (!order) return json({ error: "order_not_found" }, 404);
    if (!["submitted", "confirmed"].includes(order.status)) return json({ error: "order_not_payable", status: order.status }, 409);

    const { data: membership, error: membershipError } = await admin.from("memberships").select("role,status").eq("tenant_id", order.tenant_id).eq("profile_id", authData.user.id).eq("status", "active").maybeSingle();
    if (membershipError) return json({ error: "membership_check_failed", details: membershipError.message }, 500);
    if (!membership || !["owner", "admin", "operations_agent"].includes(membership.role)) return json({ error: "forbidden" }, 403);

    const { data: facts, error: factsError } = await admin.from("financial_facts").select("fact_type,amount_minor").eq("order_id", order.id);
    if (factsError) return json({ error: "financial_facts_lookup_failed", details: factsError.message }, 500);
    let gross = 0, reversed = 0, refunded = 0;
    for (const fact of facts ?? []) {
      const amount = Number(fact.amount_minor ?? 0);
      if (fact.fact_type === "PAYMENT_RECORDED") gross += amount;
      else if (fact.fact_type === "PAYMENT_REVERSED") reversed += amount;
      else if (fact.fact_type === "REFUND_RECORDED") refunded += amount;
    }
    const outstandingMinor = Math.max(Number(order.grand_total_minor ?? 0) - ((gross - reversed) - refunded), 0);
    if (!Number.isFinite(outstandingMinor) || outstandingMinor <= 0) return json({ error: "order_has_no_outstanding_balance" }, 409);

    const { data: existingCharge, error: existingChargeError } = await admin.from("payment_charges").select("id,tenant_id,order_id,status,currency,amount_minor,external_reference,provider,provider_order_id").eq("order_id", order.id).eq("provider", "mercado_pago").in("status", ["draft", "pending", "processing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existingChargeError) return json({ error: "charge_lookup_failed", details: existingChargeError.message }, 500);
    if (existingCharge) charge = existingCharge;
    else {
      const externalReference = `cobs_${String(order.id).replaceAll("-", "")}_${Date.now()}`;
      const { data: createdCharge, error: createChargeError } = await admin.from("payment_charges").insert({
        tenant_id: order.tenant_id,
        order_id: order.id,
        provider: "mercado_pago",
        status: "draft",
        currency: order.currency,
        amount_minor: outstandingMinor,
        external_reference: externalReference,
        description: order.reference_label ? `COBS ${order.reference_label}` : "COBS order payment",
        created_by: authData.user.id,
        metadata: { environment: MP_ENVIRONMENT, source: "commerce_order" },
      }).select("id,tenant_id,order_id,status,currency,amount_minor,external_reference,provider,provider_order_id").single();
      if (createChargeError || !createdCharge) return json({ error: "charge_create_failed", details: createChargeError?.message }, 500);
      charge = createdCharge;
    }
  }

  if (charge.provider !== "mercado_pago") return json({ error: "unsupported_provider" }, 409);
  if (["paid", "cancelled", "expired", "refunded", "partially_refunded"].includes(charge.status)) return json({ error: "charge_not_payable", status: charge.status }, 409);
  if (charge.currency !== "BRL") return json({ error: "unsupported_currency" }, 409);

  const { data: membership, error: membershipError } = await admin.from("memberships").select("role,status").eq("tenant_id", charge.tenant_id).eq("profile_id", authData.user.id).eq("status", "active").maybeSingle();
  if (membershipError) return json({ error: "membership_check_failed", details: membershipError.message }, 500);
  if (!membership || !["owner", "admin", "operations_agent"].includes(membership.role)) return json({ error: "forbidden" }, 403);

  const { data: existingAttempt, error: existingError } = await admin.from("payment_attempts").select("*").eq("charge_id", charge.id).eq("provider", "mercado_pago").eq("method", "pix").in("status", ["created", "pending", "processing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingError) return json({ error: "attempt_lookup_failed", details: existingError.message }, 500);

  if (existingAttempt?.provider_order_id) {
    try {
      const currentResponse = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(existingAttempt.provider_order_id)}`, {
        headers: { accept: "application/json", authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const current = await currentResponse.json().catch(() => ({}));
      if (currentResponse.ok) {
        const payment = current?.transactions?.payments?.[0] ?? {};
        const method = payment?.payment_method ?? {};
        const providerStatus = payment?.status ?? current?.status ?? existingAttempt.provider_status ?? null;
        const providerStatusDetail = payment?.status_detail ?? current?.status_detail ?? existingAttempt.provider_status_detail ?? null;
        const attemptStatus = mapAttemptStatus(providerStatus, providerStatusDetail);
        const now = new Date().toISOString();
        const attemptPatch: Record<string, unknown> = {
          status: attemptStatus,
          provider_payment_id: payment?.id ?? existingAttempt.provider_payment_id ?? null,
          provider_status: providerStatus,
          provider_status_detail: providerStatusDetail,
          response_snapshot: current,
          pix_qr_code: method?.qr_code ?? existingAttempt.pix_qr_code ?? null,
          pix_qr_code_base64: method?.qr_code_base64 ?? existingAttempt.pix_qr_code_base64 ?? null,
          pix_ticket_url: method?.ticket_url ?? existingAttempt.pix_ticket_url ?? null,
        };
        if (attemptStatus === "approved") attemptPatch.approved_at = now;
        await admin.from("payment_attempts").update(attemptPatch).eq("id", existingAttempt.id);

        const chargeStatus = attemptStatus === "approved" ? "paid" : attemptStatus === "processing" ? "processing" : attemptStatus === "rejected" ? "failed" : "pending";
        const chargePatch: Record<string, unknown> = { status: chargeStatus, provider_order_id: existingAttempt.provider_order_id };
        if (chargeStatus === "paid") {
          chargePatch.paid_amount_minor = existingAttempt.amount_minor;
          chargePatch.paid_at = now;
        }
        await admin.from("payment_charges").update(chargePatch).eq("id", charge.id);

        if (chargeStatus === "paid") {
          const { error: factError } = await admin.rpc("record_provider_payment", {
            _order_id: charge.order_id,
            _amount_minor: existingAttempt.amount_minor,
            _reference: `mercado_pago:${payment?.id ?? existingAttempt.provider_order_id}`,
            _reason: "Mercado Pago payment approved",
            _occurred_at: payment?.date_approved ?? current?.last_updated_date ?? now,
          });
          if (factError) return json({ error: "financial_fact_failed", details: factError.message }, 500);
        }

        return json({
          charge_id: charge.id,
          attempt_id: existingAttempt.id,
          provider_order_id: existingAttempt.provider_order_id,
          provider_payment_id: payment?.id ?? existingAttempt.provider_payment_id ?? null,
          status: attemptStatus,
          provider_status: providerStatus,
          provider_status_detail: providerStatusDetail,
          pix: {
            qr_code: method?.qr_code ?? existingAttempt.pix_qr_code ?? null,
            qr_code_base64: method?.qr_code_base64 ?? existingAttempt.pix_qr_code_base64 ?? null,
            ticket_url: method?.ticket_url ?? existingAttempt.pix_ticket_url ?? null,
          },
          reused: true,
          reconciled: true,
          environment: MP_ENVIRONMENT,
        });
      }
    } catch (error) {
      console.error("mercado_pago_reconcile_failed", error);
    }

    if (existingAttempt.pix_qr_code || existingAttempt.pix_ticket_url) {
      return json({
        charge_id: charge.id,
        attempt_id: existingAttempt.id,
        provider_order_id: existingAttempt.provider_order_id,
        provider_payment_id: existingAttempt.provider_payment_id,
        status: existingAttempt.status,
        provider_status: existingAttempt.provider_status,
        provider_status_detail: existingAttempt.provider_status_detail,
        pix: { qr_code: existingAttempt.pix_qr_code, qr_code_base64: existingAttempt.pix_qr_code_base64, ticket_url: existingAttempt.pix_ticket_url },
        reused: true,
        reconciled: false,
        environment: MP_ENVIRONMENT,
      });
    }
  }

  const amount = (Number(charge.amount_minor) / 100).toFixed(2);
  const externalReference = /^[A-Za-z0-9_-]{1,64}$/.test(charge.external_reference) ? charge.external_reference : `cobs_${String(charge.id).replaceAll("-", "")}`;
  let attempt = existingAttempt;
  if (!attempt) {
    const idempotencyKey = crypto.randomUUID();
    const payer = MP_ENVIRONMENT === "test" ? { email: "test_user_br@testuser.com", first_name: "APRO" } : { email: payerEmail };
    const requestSnapshot = {
      type: "online",
      total_amount: amount,
      external_reference: externalReference,
      processing_mode: "automatic",
      transactions: { payments: [{ amount, payment_method: { id: "pix", type: "bank_transfer" } }] },
      payer,
    };
    const { data: createdAttempt, error: createAttemptError } = await admin.from("payment_attempts").insert({
      tenant_id: charge.tenant_id,
      charge_id: charge.id,
      provider: "mercado_pago",
      method: "pix",
      status: "created",
      amount_minor: charge.amount_minor,
      idempotency_key: idempotencyKey,
      request_snapshot: requestSnapshot,
      metadata: { payment_method_id: "pix", environment: MP_ENVIRONMENT },
    }).select("*").single();
    if (createAttemptError || !createdAttempt) return json({ error: "attempt_create_failed", details: createAttemptError?.message }, 500);
    attempt = createdAttempt;
  }

  let mpResponse: Response;
  try {
    mpResponse = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${MP_ACCESS_TOKEN}`, "x-idempotency-key": attempt.idempotency_key },
      body: JSON.stringify(attempt.request_snapshot),
    });
  } catch {
    return json({ error: "mercado_pago_network_error", attempt_id: attempt.id }, 502);
  }
  const mp = await mpResponse.json().catch(() => ({}));
  if (!mpResponse.ok) {
    await admin.from("payment_attempts").update({ status: "rejected", provider_status: "request_error", response_snapshot: mp }).eq("id", attempt.id);
    return json({ error: "mercado_pago_error", status: mpResponse.status, details: mp, attempt_id: attempt.id }, 502);
  }

  const payment = mp?.transactions?.payments?.[0] ?? {};
  const paymentMethod = payment?.payment_method ?? {};
  const providerStatus = payment?.status ?? mp?.status ?? null;
  const providerStatusDetail = payment?.status_detail ?? mp?.status_detail ?? null;
  const attemptStatus = mapAttemptStatus(providerStatus, providerStatusDetail);
  const { error: updateAttemptError } = await admin.from("payment_attempts").update({
    status: attemptStatus,
    provider_order_id: mp?.id ?? null,
    provider_payment_id: payment?.id ?? null,
    provider_status: providerStatus,
    provider_status_detail: providerStatusDetail,
    pix_qr_code: paymentMethod?.qr_code ?? null,
    pix_qr_code_base64: paymentMethod?.qr_code_base64 ?? null,
    pix_ticket_url: paymentMethod?.ticket_url ?? null,
    response_snapshot: mp,
  }).eq("id", attempt.id);
  if (updateAttemptError) return json({ error: "attempt_update_failed", details: updateAttemptError.message, provider_order_id: mp?.id ?? null }, 500);

  const chargeStatus = attemptStatus === "approved" ? "paid" : attemptStatus === "processing" ? "processing" : "pending";
  const chargePatch: Record<string, unknown> = { status: chargeStatus, provider_order_id: mp?.id ?? null };
  if (chargeStatus === "paid") {
    chargePatch.paid_amount_minor = charge.amount_minor;
    chargePatch.paid_at = new Date().toISOString();
  }
  const { error: updateChargeError } = await admin.from("payment_charges").update(chargePatch).eq("id", charge.id);
  if (updateChargeError) return json({ error: "charge_update_failed", details: updateChargeError.message, provider_order_id: mp?.id ?? null }, 500);

  return json({
    charge_id: charge.id,
    attempt_id: attempt.id,
    provider_order_id: mp?.id ?? null,
    provider_payment_id: payment?.id ?? null,
    status: attemptStatus,
    provider_status: providerStatus,
    provider_status_detail: providerStatusDetail,
    pix: { qr_code: paymentMethod?.qr_code ?? null, qr_code_base64: paymentMethod?.qr_code_base64 ?? null, ticket_url: paymentMethod?.ticket_url ?? null },
    reused: false,
    environment: MP_ENVIRONMENT,
  }, 201);
});