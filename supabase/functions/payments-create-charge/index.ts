import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEYS = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const MP_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const MP_ENVIRONMENT = Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "test";

const publishableKey = SUPABASE_PUBLISHABLE_KEYS.default;
const secretKey = SUPABASE_SECRET_KEYS.default;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!MP_ACCESS_TOKEN) return json({ error: "mercado_pago_not_configured" }, 500);
  if (!publishableKey || !secretKey) return json({ error: "supabase_keys_not_available" }, 500);

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const userClient = createClient(SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "invalid_session" }, 401);

  let input: { charge_id?: string; payer_email?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const chargeId = input.charge_id?.trim();
  const payerEmail = input.payer_email?.trim().toLowerCase();
  if (!chargeId) return json({ error: "charge_id_required" }, 400);
  if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
    return json({ error: "valid_payer_email_required" }, 400);
  }

  const { data: charge, error: chargeError } = await admin
    .from("payment_charges")
    .select("id,tenant_id,order_id,status,currency,amount_minor,external_reference,provider,provider_order_id")
    .eq("id", chargeId)
    .maybeSingle();

  if (chargeError) return json({ error: "charge_lookup_failed" }, 500);
  if (!charge) return json({ error: "charge_not_found" }, 404);
  if (charge.provider !== "mercado_pago") return json({ error: "unsupported_provider" }, 409);
  if (["paid", "cancelled", "expired", "refunded", "partially_refunded"].includes(charge.status)) {
    return json({ error: "charge_not_payable", status: charge.status }, 409);
  }
  if (charge.currency !== "BRL") return json({ error: "unsupported_currency" }, 409);

  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .select("role,status")
    .eq("tenant_id", charge.tenant_id)
    .eq("profile_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) return json({ error: "membership_check_failed" }, 500);
  if (!membership || !["owner", "admin", "operations_agent"].includes(membership.role)) {
    return json({ error: "forbidden" }, 403);
  }

  const { data: existingAttempt, error: existingError } = await admin
    .from("payment_attempts")
    .select("*")
    .eq("charge_id", charge.id)
    .eq("provider", "mercado_pago")
    .eq("method", "bank_transfer")
    .in("status", ["created", "pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) return json({ error: "attempt_lookup_failed" }, 500);

  if (existingAttempt?.provider_order_id && (existingAttempt.pix_qr_code || existingAttempt.pix_ticket_url)) {
    return json({
      charge_id: charge.id,
      attempt_id: existingAttempt.id,
      provider_order_id: existingAttempt.provider_order_id,
      provider_payment_id: existingAttempt.provider_payment_id,
      status: existingAttempt.status,
      provider_status: existingAttempt.provider_status,
      provider_status_detail: existingAttempt.provider_status_detail,
      pix: {
        qr_code: existingAttempt.pix_qr_code,
        qr_code_base64: existingAttempt.pix_qr_code_base64,
        ticket_url: existingAttempt.pix_ticket_url,
      },
      reused: true,
      environment: MP_ENVIRONMENT,
    });
  }

  const amount = (Number(charge.amount_minor) / 100).toFixed(2);
  const externalReference = /^[A-Za-z0-9_-]{1,64}$/.test(charge.external_reference)
    ? charge.external_reference
    : `cobs_${String(charge.id).replaceAll("-", "")}`;

  let attempt = existingAttempt;
  if (!attempt) {
    const idempotencyKey = crypto.randomUUID();
    const requestSnapshot = {
      type: "online",
      total_amount: amount,
      external_reference: externalReference,
      processing_mode: "automatic",
      transactions: { payments: [{ amount, payment_method: { id: "pix", type: "bank_transfer" } }] },
      payer: { email: payerEmail },
    };

    const { data: createdAttempt, error: createAttemptError } = await admin
      .from("payment_attempts")
      .insert({
        tenant_id: charge.tenant_id,
        charge_id: charge.id,
        provider: "mercado_pago",
        method: "bank_transfer",
        status: "created",
        amount_minor: charge.amount_minor,
        idempotency_key: idempotencyKey,
        request_snapshot: requestSnapshot,
        metadata: { payment_method_id: "pix", environment: MP_ENVIRONMENT },
      })
      .select("*")
      .single();

    if (createAttemptError || !createdAttempt) return json({ error: "attempt_create_failed" }, 500);
    attempt = createdAttempt;
  }

  const body = attempt.request_snapshot;

  let mpResponse: Response;
  try {
    mpResponse = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "x-idempotency-key": attempt.idempotency_key,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return json({ error: "mercado_pago_network_error", attempt_id: attempt.id }, 502);
  }

  const mp = await mpResponse.json().catch(() => ({}));

  if (!mpResponse.ok) {
    await admin
      .from("payment_attempts")
      .update({ status: "rejected", provider_status: "request_error", response_snapshot: mp })
      .eq("id", attempt.id);
    return json({ error: "mercado_pago_error", status: mpResponse.status, details: mp, attempt_id: attempt.id }, 502);
  }

  const payment = mp?.transactions?.payments?.[0] ?? {};
  const paymentMethod = payment?.payment_method ?? {};
  const providerStatus = payment?.status ?? mp?.status ?? null;
  const providerStatusDetail = payment?.status_detail ?? mp?.status_detail ?? null;
  const attemptStatus = mapAttemptStatus(providerStatus);

  const { error: updateAttemptError } = await admin
    .from("payment_attempts")
    .update({
      status: attemptStatus,
      provider_order_id: mp?.id ?? null,
      provider_payment_id: payment?.id ?? null,
      provider_status: providerStatus,
      provider_status_detail: providerStatusDetail,
      pix_qr_code: paymentMethod?.qr_code ?? null,
      pix_qr_code_base64: paymentMethod?.qr_code_base64 ?? null,
      pix_ticket_url: paymentMethod?.ticket_url ?? null,
      response_snapshot: mp,
    })
    .eq("id", attempt.id);

  if (updateAttemptError) return json({ error: "attempt_update_failed", provider_order_id: mp?.id ?? null }, 500);

  const chargeStatus = attemptStatus === "approved" ? "paid" : attemptStatus === "processing" ? "processing" : "pending";
  const chargePatch: Record<string, unknown> = { status: chargeStatus, provider_order_id: mp?.id ?? null };
  if (chargeStatus === "paid") {
    chargePatch.paid_amount_minor = charge.amount_minor;
    chargePatch.paid_at = new Date().toISOString();
  }

  const { error: updateChargeError } = await admin.from("payment_charges").update(chargePatch).eq("id", charge.id);
  if (updateChargeError) return json({ error: "charge_update_failed", provider_order_id: mp?.id ?? null }, 500);

  return json({
    charge_id: charge.id,
    attempt_id: attempt.id,
    provider_order_id: mp?.id ?? null,
    provider_payment_id: payment?.id ?? null,
    status: attemptStatus,
    provider_status: providerStatus,
    provider_status_detail: providerStatusDetail,
    pix: {
      qr_code: paymentMethod?.qr_code ?? null,
      qr_code_base64: paymentMethod?.qr_code_base64 ?? null,
      ticket_url: paymentMethod?.ticket_url ?? null,
    },
    reused: false,
    environment: MP_ENVIRONMENT,
  }, 201);
});
