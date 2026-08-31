import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEYS = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const publishableKey = SUPABASE_PUBLISHABLE_KEYS.default;
const secretKey = SUPABASE_SECRET_KEYS.default;
const MP_ENVIRONMENT = Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "test";

const CHECKOUTS = {
  commercial: { operationCode: "CIOSP-SP-2027", requiresPublicSales: true },
} as const;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-client-info, apikey",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(value: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
function normalizePhone(value?: string) { if (!value) return null; const raw = value.trim(); if (!raw) return null; const digits = raw.replace(/\D/g, ""); if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`; if (digits.length === 10 || digits.length === 11) return `+55${digits}`; return raw; }
function isQaReferer(req: Request) { const referer = req.headers.get("referer"); if (!referer) return false; try { const url = new URL(referer); return url.pathname === "/ciosp-2027" && url.searchParams.get("sales_qa") === "1"; } catch { return false; } }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!secretKey) return json({ error: "server_not_configured" }, 500);
  let body: { full_name?: string; email?: string; phone?: string; idempotency_key?: string; checkout_key?: keyof typeof CHECKOUTS };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const checkoutKey = (body.checkout_key ?? "commercial") as keyof typeof CHECKOUTS; const cfg = CHECKOUTS[checkoutKey]; if (!cfg) return json({ error: "invalid_checkout_key" }, 400);
  const fullName = (body.full_name ?? "").trim(); const email = (body.email ?? "").trim().toLowerCase(); const phone = normalizePhone(body.phone); const idempotencyKey = (body.idempotency_key ?? crypto.randomUUID()).trim();
  if (fullName.length < 2 || fullName.length > 120) return json({ error: "invalid_full_name" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "invalid_email" }, 400);
  if (phone && !/^\+[1-9][0-9]{7,14}$/.test(phone)) return json({ error: "invalid_phone" }, 400);
  if (idempotencyKey.length < 16 || idempotencyKey.length > 120) return json({ error: "invalid_idempotency_key" }, 400);
  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const { data: op, error: opError } = await admin.from("operations").select("id,tenant_id,code,offering_id,archived_at").eq("code", cfg.operationCode).is("archived_at", null).maybeSingle(); if (opError) return json({ error: "operation_lookup_failed" }, 500); if (!op?.offering_id) return json({ error: "checkout_not_configured" }, 409);
  const { data: offering, error: offeringError } = await admin.from("offerings").select("id,status,metadata").eq("id", op.offering_id).eq("tenant_id", op.tenant_id).maybeSingle(); if (offeringError) return json({ error: "offering_lookup_failed" }, 500); if (!offering) return json({ error: "offering_not_found" }, 404);
  const metadata = (offering.metadata ?? {}) as Record<string, unknown>; let qaClosedSalesAllowed = false; const salesClosed = cfg.requiresPublicSales && (offering.status !== "active" || metadata.sales_public !== true);
  if (salesClosed) { if (!isQaReferer(req)) return json({ error: "sales_not_open" }, 409); if (MP_ENVIRONMENT !== "test") return json({ error: "qa_checkout_test_only" }, 503); if (!publishableKey) return json({ error: "qa_auth_not_configured" }, 500); const authHeader = req.headers.get("authorization"); if (!authHeader) return json({ error: "qa_auth_required" }, 401); const userClient = createClient(SUPABASE_URL, publishableKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }); const { data: authData, error: authError } = await userClient.auth.getUser(); if (authError || !authData.user) return json({ error: "qa_invalid_session" }, 401); const { data: membership, error: membershipError } = await admin.from("memberships").select("role,status").eq("tenant_id", op.tenant_id).eq("profile_id", authData.user.id).eq("status", "active").maybeSingle(); if (membershipError) return json({ error: "qa_membership_check_failed" }, 500); if (!membership || !["owner", "admin", "operations_agent"].includes(membership.role)) return json({ error: "qa_forbidden" }, 403); qaClosedSalesAllowed = true; }
  const { data: sellable } = await admin.from("sellables").select("id").eq("tenant_id", op.tenant_id).eq("offering_id", offering.id).eq("status", "active").limit(1).maybeSingle(); if (!sellable) return json({ error: "active_sellable_not_found" }, 409);
  const now = new Date().toISOString(); const { data: price } = await admin.from("prices").select("id").eq("tenant_id", op.tenant_id).eq("sellable_id", sellable.id).eq("status", "active").lte("valid_from", now).or(`valid_until.is.null,valid_until.gt.${now}`).limit(1).maybeSingle(); if (!price) return json({ error: "active_price_not_found" }, 409);
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32)); const checkoutToken = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join(""); const tokenHash = await sha256(checkoutToken);
  const { data, error } = await admin.rpc("create_public_checkout_order", { _operation_code: cfg.operationCode, _full_name: fullName, _email: email, _phone_e164: phone, _checkout_token_hash: tokenHash, _idempotency_key: idempotencyKey, _allow_closed: qaClosedSalesAllowed }); if (error) return json({ error: "checkout_order_failed", details: error.message }, 409);
  if (qaClosedSalesAllowed && data?.order_id) { const { data: orderRow } = await admin.from("orders").select("metadata").eq("id", data.order_id).maybeSingle(); const orderMetadata = (orderRow?.metadata ?? {}) as Record<string, unknown>; await admin.from("orders").update({ metadata: { ...orderMetadata, qa_public_checkout: true, qa_environment: "test", qa_sales_public_bypass: true } }).eq("id", data.order_id); }
  return json({ ...data, checkout_token: checkoutToken, payer_email: email, checkout_key: checkoutKey, qa_mode: qaClosedSalesAllowed }, 201);
});