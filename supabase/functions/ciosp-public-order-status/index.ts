import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = KEYS.default;
const MP_ENV = Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "test";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-client-info, apikey, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!secretKey) return json({ error: "server_not_configured" }, 500);
  if (!["test", "production"].includes(MP_ENV))
    return json({ error: "mercado_pago_environment_invalid" }, 500);

  let body: { order_id?: string; checkout_token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const orderId = (body.order_id ?? "").trim();
  const token = (body.checkout_token ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[0-9a-f]{64}$/i.test(token))
    return json({ error: "invalid_resume_proof" }, 400);

  const db = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const hash = await sha256(token);
  const { data: session, error: sessionError } = await db
    .from("public_checkout_sessions")
    .select("id,tenant_id,order_id,status,expires_at")
    .eq("order_id", orderId)
    .eq("token_hash", hash)
    .maybeSingle();
  if (sessionError) return json({ error: "resume_session_lookup_failed" }, 500);
  if (!session) return json({ error: "invalid_resume_proof" }, 403);
  if (session.status !== "active")
    return json({ error: "resume_session_not_active", status: session.status }, 409);
  if (new Date(session.expires_at).getTime() <= Date.now())
    return json({ error: "resume_session_expired" }, 409);

  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id,tenant_id,status,currency,grand_total_minor,metadata")
    .eq("id", orderId)
    .eq("tenant_id", session.tenant_id)
    .maybeSingle();
  if (orderError) return json({ error: "resume_order_lookup_failed" }, 500);
  if (!order) return json({ error: "order_not_found" }, 404);

  const metadata = (order.metadata ?? {}) as Record<string, unknown>;
  const paymentEnvironment = metadata.qa_public_checkout === true ? "test" : MP_ENV;
  const { data: chargeCandidates, error: chargeError } = await db
    .from("payment_charges")
    .select("id,status,amount_minor,installment_number,installment_count,due_at,metadata")
    .eq("order_id", orderId)
    .eq("tenant_id", session.tenant_id)
    .eq("provider", "mercado_pago")
    .order("installment_number", { ascending: true });
  if (chargeError) return json({ error: "resume_charges_lookup_failed" }, 500);
  const charges = (chargeCandidates ?? []).filter(
    (charge: any) => charge?.metadata?.environment === paymentEnvironment,
  );

  const { data: facts, error: factsError } = await db
    .from("financial_facts")
    .select("fact_type,amount_minor,occurred_at")
    .eq("tenant_id", session.tenant_id)
    .eq("order_id", orderId)
    .order("occurred_at", { ascending: true });
  if (factsError) return json({ error: "resume_facts_lookup_failed" }, 500);

  let received = 0;
  for (const fact of facts ?? []) {
    const amount = Number(fact.amount_minor ?? 0);
    if (fact.fact_type === "PAYMENT_RECORDED") received += amount;
    if (fact.fact_type === "PAYMENT_REVERSED" || fact.fact_type === "REFUND_RECORDED")
      received -= amount;
  }
  received = Math.max(received, 0);
  const total = Number(order.grand_total_minor ?? 0);
  const next = charges.find(
    (charge: any) => !["paid", "cancelled", "refunded"].includes(charge.status),
  );

  return json({
    order_id: order.id,
    order_status: order.status,
    currency: order.currency,
    total_minor: total,
    received_minor: received,
    balance_minor: Math.max(total - received, 0),
    payment_status: received >= total ? "paid" : next?.status ?? "awaiting_payment",
    payment_environment: paymentEnvironment,
    next_installment: next
      ? {
          charge_id: next.id,
          installment_number: next.installment_number,
          installment_count: next.installment_count,
          amount_minor: Number(next.amount_minor),
          due_at: next.due_at,
          status: next.status,
        }
      : null,
    charges: charges.map((charge: any) => ({
      id: charge.id,
      installment_number: charge.installment_number,
      installment_count: charge.installment_count,
      amount_minor: Number(charge.amount_minor),
      due_at: charge.due_at,
      status: charge.status,
    })),
  });
});
