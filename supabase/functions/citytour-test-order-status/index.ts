import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SECRET_KEY = SECRET_KEYS.default;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SECRET_KEY) return json({ error: "server_not_configured" }, 500);

  let input: { order_id?: string; checkout_token?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const orderId = (input.order_id ?? "").trim();
  const checkoutToken = (input.checkout_token ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[0-9a-f]{64}$/i.test(checkoutToken)) {
    return json({ error: "invalid_resume_proof" }, 400);
  }

  const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  const tokenHash = await sha256(checkoutToken);
  const { data: session, error: sessionError } = await db
    .from("public_checkout_sessions")
    .select("id,tenant_id,order_id,status,expires_at")
    .eq("order_id", orderId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (sessionError) return json({ error: "resume_session_lookup_failed" }, 500);
  if (!session) return json({ error: "invalid_resume_proof" }, 403);
  if (!["active", "consumed"].includes(session.status)) {
    return json({ error: "resume_session_not_readable", status: session.status }, 409);
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return json({ error: "resume_session_expired" }, 409);
  }

  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id,tenant_id,operation_id,buyer_person_id,status,currency,grand_total_minor,metadata")
    .eq("id", orderId)
    .eq("tenant_id", session.tenant_id)
    .maybeSingle();
  if (orderError) return json({ error: "resume_order_lookup_failed" }, 500);
  if (!order) return json({ error: "order_not_found" }, 404);

  const metadata = (order.metadata ?? {}) as Record<string, unknown>;
  if (
    metadata.qa_public_checkout !== true ||
    metadata.qa_environment !== "test" ||
    metadata.qa_fixture_key !== FIXTURE_KEY ||
    order.currency !== "BRL" ||
    Number(order.grand_total_minor) !== 100
  ) {
    return json({ error: "order_not_citytour_test_fixture" }, 409);
  }

  const { data: operation } = await db
    .from("operations")
    .select("code,archived_at")
    .eq("id", order.operation_id)
    .eq("tenant_id", order.tenant_id)
    .maybeSingle();
  if (!operation || operation.code !== OPERATION_CODE || operation.archived_at) {
    return json({ error: "order_operation_mismatch" }, 409);
  }

  const { data: chargeCandidates, error: chargeError } = await db
    .from("payment_charges")
    .select("id,status,amount_minor,metadata")
    .eq("order_id", order.id)
    .eq("tenant_id", order.tenant_id)
    .eq("provider", "mercado_pago")
    .order("created_at", { ascending: true });
  if (chargeError) return json({ error: "resume_charges_lookup_failed" }, 500);
  const charges = (chargeCandidates ?? []).filter(
    (charge: any) =>
      charge?.metadata?.environment === "test" &&
      charge?.metadata?.qa_fixture_key === FIXTURE_KEY,
  );

  const { data: facts, error: factsError } = await db
    .from("financial_facts")
    .select("fact_type,amount_minor")
    .eq("tenant_id", order.tenant_id)
    .eq("order_id", order.id);
  if (factsError) return json({ error: "resume_facts_lookup_failed" }, 500);

  let received = 0;
  for (const fact of facts ?? []) {
    const amount = Number(fact.amount_minor ?? 0);
    if (fact.fact_type === "PAYMENT_RECORDED") received += amount;
    if (fact.fact_type === "PAYMENT_REVERSED" || fact.fact_type === "REFUND_RECORDED") received -= amount;
  }
  received = Math.max(received, 0);
  const total = Number(order.grand_total_minor ?? 0);

  let participationReady = false;
  if (order.buyer_person_id && order.operation_id) {
    const { data: participation } = await db
      .from("operation_participations")
      .select("id,status")
      .eq("tenant_id", order.tenant_id)
      .eq("operation_id", order.operation_id)
      .eq("person_id", order.buyer_person_id)
      .eq("participation_kind", "participant")
      .maybeSingle();
    participationReady = participation?.status === "confirmed";
  }

  return json({
    order_id: order.id,
    order_status: order.status,
    currency: order.currency,
    total_minor: total,
    received_minor: received,
    balance_minor: Math.max(total - received, 0),
    payment_status: received >= total ? "paid" : charges.find((charge: any) => !["paid", "cancelled", "refunded"].includes(charge.status))?.status ?? "awaiting_payment",
    payment_environment: "test",
    participation_ready: participationReady,
    session_state: session.status,
    charges: charges.map((charge: any) => ({
      id: charge.id,
      amount_minor: Number(charge.amount_minor),
      status: charge.status,
    })),
  });
});
