import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secret = keys.default;
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
  if (!secret) return json({ error: "server_not_configured" }, 500);
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
  const db = createClient(url, secret, { auth: { persistSession: false } });
  const hash = await sha256(token);
  const { data: session, error: se } = await db
    .from("public_checkout_sessions")
    .select("id,tenant_id,order_id,status,expires_at")
    .eq("order_id", orderId)
    .eq("token_hash", hash)
    .maybeSingle();
  if (se) return json({ error: "resume_session_lookup_failed" }, 500);
  if (!session) return json({ error: "invalid_resume_proof" }, 403);
  if (session.status !== "active")
    return json({ error: "resume_session_not_active", status: session.status }, 409);
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await db.from("public_checkout_sessions").update({ status: "expired" }).eq("id", session.id);
    return json({ error: "resume_session_expired" }, 409);
  }
  const { data: order, error: oe } = await db
    .from("orders")
    .select("id,status,currency,grand_total_minor,metadata")
    .eq("id", orderId)
    .eq("tenant_id", session.tenant_id)
    .maybeSingle();
  if (oe) return json({ error: "resume_order_lookup_failed" }, 500);
  if (!order) return json({ error: "order_not_found" }, 404);
  const { data: charges, error: ce } = await db
    .from("payment_charges")
    .select("id,status,amount_minor,installment_number,installment_count,due_at,metadata")
    .eq("order_id", orderId)
    .eq("tenant_id", session.tenant_id)
    .eq("provider", "mercado_pago")
    .order("installment_number", { ascending: true });
  if (ce) return json({ error: "resume_charges_lookup_failed" }, 500);
  const { data: facts, error: fe } = await db
    .from("financial_facts")
    .select("fact_type,amount_minor,occurred_at")
    .eq("order_id", orderId)
    .order("occurred_at", { ascending: true });
  if (fe) return json({ error: "resume_facts_lookup_failed" }, 500);
  let received = 0;
  for (const fact of facts ?? []) {
    const amount = Number(fact.amount_minor ?? 0);
    if (fact.fact_type === "PAYMENT_RECORDED") received += amount;
    if (fact.fact_type === "PAYMENT_REVERSED" || fact.fact_type === "REFUND_RECORDED") received -= amount;
  }
  received = Math.max(received, 0);
  const total = Number(order.grand_total_minor ?? 0);
  const next = (charges ?? []).find((charge: any) => !["paid", "cancelled", "refunded"].includes(charge.status));
  return json({
    order_id: order.id,
    order_status: order.status,
    currency: order.currency,
    total_minor: total,
    received_minor: received,
    balance_minor: Math.max(total - received, 0),
    payment_status: received >= total ? "paid" : next?.status ?? "awaiting_payment",
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
    charges: (charges ?? []).map((charge: any) => ({
      id: charge.id,
      installment_number: charge.installment_number,
      amount_minor: Number(charge.amount_minor),
      due_at: charge.due_at,
      status: charge.status,
      environment: charge.metadata?.environment ?? "unknown",
    })),
  });
});
