import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { paymentEnvironment, orderEnvironmentMatches, paymentPlan } from "../_shared/ciosp-payment-policy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const P = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const S = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const publishableKey = P.default;
const secretKey = S.default;
const MP_ENVIRONMENT = paymentEnvironment(Deno.env.get("MERCADO_PAGO_ENVIRONMENT"));
const CODE = "CIOSP-SP-2027";
const COMMERCIAL_TERMS_VERSION = "ciosp-2027-v1";
const CANCELLATION_POLICY_VERSION = "ciosp-2027-cancellation-v1";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-client-info, apikey, x-ciosp-qa, x-checkout-token",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(v: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))); }
function phone(v?: string) { if (!v) return null; const r = v.trim(), d = r.replace(/\D/g, ""); if (!r) return null; if (r.startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`; if (d.length === 10 || d.length === 11) return `+55${d}`; return r; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!secretKey) return json({ error: "server_not_configured" }, 500);

  if (!MP_ENVIRONMENT) return json({ error: "mercado_pago_environment_invalid" }, 500);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  if (!b || typeof b !== "object" || ["full_name", "email", "phone", "idempotency_key"].some(key => b[key] != null && typeof b[key] !== "string")) return json({error:"invalid_input"},400);
  const full = (b.full_name ?? "").trim();
  const email = (b.email ?? "").trim().toLowerCase();
  const ph = phone(b.phone);
  const idem = (b.idempotency_key ?? crypto.randomUUID()).trim();

  if (full.length < 2 || full.length > 120) return json({ error: "invalid_full_name" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "invalid_email" }, 400);
  if (ph && !/^\+[1-9][0-9]{7,14}$/.test(ph)) return json({ error: "invalid_phone" }, 400);
  if (idem.length < 16 || idem.length > 120) return json({ error: "invalid_idempotency_key" }, 400);
  if (b.terms_accepted !== true) return json({ error: "terms_acceptance_required" }, 400);
  if (b.commercial_terms_version !== COMMERCIAL_TERMS_VERSION) return json({ error: "commercial_terms_version_mismatch" }, 409);
  if (b.cancellation_policy_version !== CANCELLATION_POLICY_VERSION) return json({ error: "cancellation_policy_version_mismatch" }, 409);

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const { data: op, error: oe } = await admin.from("operations").select("id,tenant_id,code,offering_id,archived_at").eq("code", CODE).is("archived_at", null).maybeSingle();
  if (oe) return json({ error: "operation_lookup_failed" }, 500);
  if (!op?.offering_id) return json({ error: "checkout_not_configured" }, 409);

  const { data: offering, error: ofe } = await admin.from("offerings").select("id,status,metadata").eq("id", op.offering_id).eq("tenant_id", op.tenant_id).maybeSingle();
  if (ofe) return json({ error: "offering_lookup_failed" }, 500);
  if (!offering) return json({ error: "offering_not_found" }, 404);

  const meta = offering.metadata ?? {};
  let allow = false;
  const closed = offering.status !== "active" || meta.sales_public !== true;
  if (closed || MP_ENVIRONMENT === "test") {
    const intent = req.headers.get("x-ciosp-qa") === "1";
    if (!intent) return json({ error: "sales_not_open" }, 409);
    if (MP_ENVIRONMENT !== "test") return json({ error: "qa_checkout_test_only" }, 503);
    if (!publishableKey) return json({ error: "qa_auth_not_configured" }, 500);
    const ah = req.headers.get("authorization");
    if (!ah) return json({ error: "qa_auth_required" }, 401);
    const uc = createClient(SUPABASE_URL, publishableKey, { global: { headers: { Authorization: ah } }, auth: { persistSession: false } });
    const { data: ad, error: ae } = await uc.auth.getUser();
    if (ae || !ad.user) return json({ error: "qa_invalid_session" }, 401);
    const { data: m, error: me } = await admin.from("memberships").select("role,status").eq("tenant_id", op.tenant_id).eq("profile_id", ad.user.id).eq("status", "active").maybeSingle();
    if (me) return json({ error: "qa_membership_check_failed" }, 500);
    if (!m || !["owner", "admin", "operations_agent"].includes(m.role)) return json({ error: "qa_forbidden" }, 403);
    allow = true;
  }

  const { data: sell } = await admin.from("sellables").select("id").eq("tenant_id", op.tenant_id).eq("offering_id", offering.id).eq("status", "active").limit(1).maybeSingle();
  if (!sell) return json({ error: "active_sellable_not_found" }, 409);
  const now = new Date().toISOString();
  const { data: price } = await admin.from("prices").select("id").eq("tenant_id", op.tenant_id).eq("sellable_id", sell.id).eq("status", "active").lte("valid_from", now).or(`valid_until.is.null,valid_until.gt.${now}`).limit(1).maybeSingle();
  if (!price) return json({ error: "active_price_not_found" }, 409);

  // A replay key deduplicates a request; it is not permission to rotate a checkout session.
  const {data: prior, error: priorError} = await admin.from("orders").select("id,metadata").eq("tenant_id",op.tenant_id).eq("metadata->>public_checkout_idempotency_key",idem).maybeSingle();
  if(priorError)return json({error:"checkout_lookup_failed"},500);
  let replayToken: string | null = null;
  if(prior){
    if(!orderEnvironmentMatches(prior.metadata??{},MP_ENVIRONMENT))return json({error:"order_environment_mismatch"},409);
    const proof=req.headers.get("x-checkout-token")??"";
    if(!/^[0-9a-f]{64}$/i.test(proof))return json({error:"checkout_resume_requires_authorization"},403);
    const {data: session,error: sessionError}=await admin.from("public_checkout_sessions").select("id,status,expires_at").eq("tenant_id",op.tenant_id).eq("order_id",prior.id).eq("token_hash",await sha256(proof)).maybeSingle();
    if(sessionError)return json({error:"checkout_session_lookup_failed"},500);
    if(!session||session.status!=="active"||new Date(session.expires_at).getTime()<=Date.now())return json({error:"checkout_resume_requires_authorization"},403);
    replayToken=proof;
  }
  try { paymentPlan(meta.payment_schedule_v1,Number(meta.target_unit_price_minor),0); } catch {return json({error:"payment_schedule_invalid"},409);}
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = replayToken ?? [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
  const hash = await sha256(token);
  const { data, error } = await admin.rpc("create_public_checkout_order", {
    _operation_code: CODE,
    _full_name: full,
    _email: email,
    _phone_e164: ph,
    _checkout_token_hash: hash,
    _idempotency_key: idem,
    _allow_closed: allow,
  });
  if (error) return json({ error: "checkout_order_failed", details: error.message }, 409);

  if(data?.reused===true && (!prior || data.order_id!==prior.id))return json({error:"checkout_resume_requires_authorization"},403);

  if (!data?.order_id) return json({ error: "checkout_order_missing" }, 500);
  const acceptedAt = new Date().toISOString();
  const { data: existingOrder, error: orderReadError } = await admin.from("orders").select("metadata").eq("id", data.order_id).eq("tenant_id", op.tenant_id).maybeSingle();
  if (orderReadError || !existingOrder) return json({ error: "terms_acceptance_order_lookup_failed" }, 500);
  const acceptance = existingOrder.metadata?.commercial_acceptance ?? {
    commercial_terms_version: COMMERCIAL_TERMS_VERSION,
    cancellation_policy_version: CANCELLATION_POLICY_VERSION,
    accepted_at: acceptedAt,
    source: "public_checkout",
  };
  const orderMetadata = { ...(existingOrder.metadata ?? {}), commercial_acceptance: acceptance,
    payment_environment: MP_ENVIRONMENT,
    commercial_snapshot: existingOrder.metadata?.commercial_snapshot ?? {
      payment_schedule_v1: meta.payment_schedule_v1,
      commercial_terms_version: COMMERCIAL_TERMS_VERSION,
      entry_minor: meta.entry_minor,
      target_unit_price_minor: meta.target_unit_price_minor,
    },
  };
  const { error: orderUpdateError } = await admin.from("orders").update({ metadata: orderMetadata }).eq("id", data.order_id).eq("tenant_id", op.tenant_id);
  if (orderUpdateError) return json({ error: "terms_acceptance_order_persist_failed" }, 500);

  const { data: reservation } = await admin.from("commercial_reservations").select("id,metadata").eq("order_id", data.order_id).eq("tenant_id", op.tenant_id).limit(1).maybeSingle();
  if (reservation?.id) {
    const reservationMetadata = { ...(reservation.metadata ?? {}), commercial_acceptance: acceptance };
    const { error: reservationUpdateError } = await admin.from("commercial_reservations").update({ metadata: reservationMetadata }).eq("id", reservation.id).eq("tenant_id", op.tenant_id);
    if (reservationUpdateError) return json({ error: "terms_acceptance_reservation_persist_failed" }, 500);
  }

  return json({ ...data, checkout_token: token, payer_email: email, checkout_key: "commercial", qa_mode: allow, commercial_acceptance: acceptance }, 201);
});

