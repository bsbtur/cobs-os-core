import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SECRET = KEYS.default;
const MP_TEST_TOKEN = Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN");
const MP_PROD_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const RETURN_BASE = "https://cobs-os-prod.vercel.app/ciosp-2027/reserva";
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/payments-mercado-pago-webhook`;
const CIOSP_CODE = "CIOSP-SP-2027";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-client-info, apikey, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(v: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SECRET) return json({ error: "server_not_configured" }, 500);

  let input: { order_id?: string; checkout_token?: string; payer_email?: string };
  try { input = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const orderId = (input.order_id ?? "").trim();
  const checkoutToken = (input.checkout_token ?? "").trim();
  const payerEmail = (input.payer_email ?? "").trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "invalid_order_id" }, 400);
  if (!/^[0-9a-f]{64}$/i.test(checkoutToken)) return json({ error: "invalid_checkout_token" }, 400);

  const db = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });
  const tokenHash = await sha256(checkoutToken);
  const { data: session, error: sessionError } = await db
    .from("public_checkout_sessions")
    .select("id,tenant_id,order_id,status,expires_at")
    .eq("order_id", orderId).eq("token_hash", tokenHash).maybeSingle();
  if (sessionError) return json({ error: "checkout_session_lookup_failed" }, 500);
  if (!session) return json({ error: "invalid_checkout_session" }, 403);
  if (session.status !== "active" || new Date(session.expires_at).getTime() <= Date.now())
    return json({ error: "checkout_session_not_active" }, 409);

  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id,tenant_id,operation_id,status,currency,grand_total_minor,metadata")
    .eq("id", orderId).eq("tenant_id", session.tenant_id).maybeSingle();
  if (orderError || !order) return json({ error: "order_not_found" }, 404);
  if (!["submitted", "confirmed"].includes(order.status)) return json({ error: "order_not_payable" }, 409);
  if (order.currency !== "BRL") return json({ error: "unsupported_currency" }, 409);

  const { data: operation } = await db.from("operations").select("code,offering_id,archived_at").eq("id", order.operation_id).maybeSingle();
  if (!operation || operation.code !== CIOSP_CODE || operation.archived_at) return json({ error: "order_not_canonical_ciosp" }, 409);
  const { data: offering } = await db.from("offerings").select("status,metadata").eq("id", operation.offering_id).maybeSingle();
  if (!offering || offering.status !== "active") return json({ error: "offering_not_active" }, 409);

  const offeringMeta = (offering.metadata ?? {}) as Record<string, unknown>;
  const orderMeta = (order.metadata ?? {}) as Record<string, unknown>;
  const qa = orderMeta.qa_public_checkout === true;
  if (offeringMeta.sales_public !== true && !qa) return json({ error: "sales_not_open" }, 409);
  // QA payment probe deliberately uses the real Mercado Pago production rail at R$1.00.
  // It is restricted to an authenticated active operator of the order tenant; public sales remain closed.
  if (qa) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "qa_operator_auth_required" }, 401);
    const jwt = authHeader.slice(7).trim();
    const { data: authData, error: authError } = await db.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "qa_operator_auth_required" }, 401);
    const { data: membership } = await db.from("memberships")
      .select("role,status").eq("tenant_id", order.tenant_id).eq("profile_id", authData.user.id).eq("status", "active").maybeSingle();
    if (!membership || !["owner", "admin", "operator"].includes(String(membership.role)))
      return json({ error: "qa_operator_forbidden" }, 403);
  }
  const environment = "production";
  const accessToken = MP_PROD_TOKEN;
  if (!accessToken) return json({ error: "mercado_pago_not_configured" }, 500);

  const totalMinor = Number(order.grand_total_minor ?? 0);
  const entryMinor = Number(offeringMeta.entry_minor ?? 349000);
  if (totalMinor !== 1249000 || entryMinor !== 349000) return json({ error: "commercial_amounts_not_configured" }, 409);

  const { data: facts, error: factsError } = await db.from("financial_facts").select("fact_type,amount_minor").eq("order_id", order.id);
  if (factsError) return json({ error: "financial_facts_lookup_failed" }, 500);
  let paidMinor = 0;
  for (const fact of facts ?? []) {
    const amount = Number(fact.amount_minor ?? 0);
    if (fact.fact_type === "PAYMENT_RECORDED") paidMinor += amount;
    else if (fact.fact_type === "PAYMENT_REVERSED" || fact.fact_type === "REFUND_RECORDED") paidMinor -= amount;
  }
  paidMinor = Math.max(0, paidMinor);
  if (paidMinor >= entryMinor) return json({ error: "entry_already_paid", paid_minor: paidMinor }, 409);

  // Clean QA proof: R$1.00. Production preserves the approved R$3,490 entry.
  const amountMinor = qa ? 100 : entryMinor - paidMinor;
  const externalReference = `cobs_${order.id.replaceAll("-", "")}_entry_pref`;
  const preference = {
    items: [{ id: "ciosp-2027-entry", title: qa ? "CIOSP 2027 — QA R$ 1,00" : "CIOSP Experience 2027 — Entrada", quantity: 1, currency_id: "BRL", unit_price: amountMinor / 100 }],
    payer: payerEmail ? { email: payerEmail } : undefined,
    external_reference: externalReference,
    back_urls: {
      success: `${RETURN_BASE}?${qa ? "sales_qa=1&" : ""}payment=success`,
      failure: `${RETURN_BASE}?${qa ? "sales_qa=1&" : ""}payment=failure`,
      pending: `${RETURN_BASE}?${qa ? "sales_qa=1&" : ""}payment=pending`,
    },
    auto_return: "approved",
    payment_methods: {
      excluded_payment_types: [
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "ticket" },
        { id: "atm" },
        { id: "prepaid_card" },
      ],
    },
    notification_url: `${WEBHOOK_URL}?source_news=webhooks`,
    metadata: { cobs_order_id: order.id, cobs_stage: "entry", environment, qa_payment_probe: qa },
  };

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(preference),
  });
  const mp = await response.json().catch(() => ({}));
  if (!response.ok || !mp?.id) return json({ error: "mercado_pago_preference_error", status: response.status }, 502);

  const checkoutUrl = mp.init_point;
  if (!checkoutUrl) return json({ error: "mercado_pago_preference_url_missing" }, 502);

  return json({
    order_id: order.id,
    preference_id: mp.id,
    checkout_url: checkoutUrl,
    amount_minor: amountMinor,
    environment,
    stage: "entry",
  });
});
