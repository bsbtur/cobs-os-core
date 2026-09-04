import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const P = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const S = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const publishableKey = P.default;
const secretKey = S.default;
const MP_ENVIRONMENT = Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "test";
const CODE = "CIOSP-SP-2027";
const COMMERCIAL_TERMS_VERSION = "ciosp-2027-v1";
const CANCELLATION_POLICY_VERSION = "ciosp-2027-cancellation-v1";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-client-info, apikey, x-ciosp-qa",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(v: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))); }
function phone(v?: string) { if (!v) return null; const r = v.trim(), d = r.replace(/\D/g, ""); if (!r) return null; if (r.startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`; if (d.length === 10 || d.length === 11) return `+55${d}`; return r; }
function qaRef(req: Request) { const r = req.headers.get("referer"); if (!r) return null; try { return new URL(r); } catch { return null; } }
function isAuthorizedPreviewQa(req: Request, full: string, email: string) {
  if (MP_ENVIRONMENT !== "test") return false;
  if (req.headers.get("x-ciosp-qa") !== "1") return false;
  const u = qaRef(req);
  if (!u || u.pathname !== "/ciosp-2027/reserva" || u.searchParams.get("sales_qa") !== "1") return false;
  const host = u.hostname.toLowerCase();
  if (!(host.startsWith("cobs-os-") && host.endsWith("-contatobsbtur-7062s-projects.vercel.app"))) return false;
  if (!/\sQA$/i.test(full)) return false;
  if (!/^[^\s@]+@example\.com\.br$/i.test(email)) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!secretKey) return json({ error: "server_not_configured" }, 500);

  let b: any;
  try { b = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

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
  let qaMode = "none";
  const closed = offering.status !== "active" || meta.sales_public !== true;
  if (closed) {
    const headerIntent = req.headers.get("x-ciosp-qa") === "1";
    const ref = qaRef(req);
    const refIntent = ref?.searchParams.get("sales_qa") === "1";
    const intent = headerIntent || refIntent;
    if (!intent) return json({ error: "sales_not_open" }, 409);
    if (MP_ENVIRONMENT !== "test") return json({ error: "qa_checkout_test_only" }, 503);

    if (isAuthorizedPreviewQa(req, full, email)) {
      allow = true;
      qaMode = "preview_test_identity";
    } else {
      if (headerIntent && refIntent && ref?.pathname === "/ciosp-2027/reserva") {
        const host = ref.hostname.toLowerCase();
        const previewHost = host.startsWith("cobs-os-") && host.endsWith("-contatobsbtur-7062s-projects.vercel.app");
        if (previewHost && (!/\sQA$/i.test(full) || !/^[^\s@]+@example\.com\.br$/i.test(email))) return json({ error: "qa_identity_required" }, 400);
      }
      if (!publishableKey) return json({ error: "qa_auth_not_configured" }, 500);
      const ah = req.headers.get("authorization");
      if (!ah) return json({ error: "qa_preview_not_allowed" }, 403);
      const uc = createClient(SUPABASE_URL, publishableKey, { global: { headers: { Authorization: ah } }, auth: { persistSession: false } });
      const { data: ad, error: ae } = await uc.auth.getUser();
      if (ae || !ad.user) return json({ error: "qa_invalid_session" }, 401);
      const { data: m, error: me } = await admin.from("memberships").select("role,status").eq("tenant_id", op.tenant_id).eq("profile_id", ad.user.id).eq("status", "active").maybeSingle();
      if (me) return json({ error: "qa_membership_check_failed" }, 500);
      if (!m || !["owner", "admin", "operations_agent"].includes(m.role)) return json({ error: "qa_forbidden" }, 403);
      allow = true;
      qaMode = "authenticated_staff";
    }
  }

  const { data: sell } = await admin.from("sellables").select("id").eq("tenant_id", op.tenant_id).eq("offering_id", offering.id).eq("status", "active").limit(1).maybeSingle();
  if (!sell) return json({ error: "active_sellable_not_found" }, 409);
  const now = new Date().toISOString();
  const { data: price } = await admin.from("prices").select("id").eq("tenant_id", op.tenant_id).eq("sellable_id", sell.id).eq("status", "active").lte("valid_from", now).or(`valid_until.is.null,valid_until.gt.${now}`).limit(1).maybeSingle();
  if (!price) return json({ error: "active_price_not_found" }, 409);

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
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

  if (data?.reused === true && data?.session_id && data?.order_id) {
    const { data: rot, error: re } = await admin.from("public_checkout_sessions").update({ token_hash: hash, status: "active", expires_at: new Date(Date.now() + 7200000).toISOString() }).eq("id", data.session_id).eq("order_id", data.order_id).eq("tenant_id", op.tenant_id).select("id").maybeSingle();
    if (re || !rot) return json({ error: "checkout_session_rotation_failed" }, 409);
  }

  if (!data?.order_id) return json({ error: "checkout_order_missing" }, 500);
  const acceptedAt = new Date().toISOString();
  const { data: existingOrder, error: orderReadError } = await admin.from("orders").select("metadata").eq("id", data.order_id).eq("tenant_id", op.tenant_id).maybeSingle();
  if (orderReadError || !existingOrder) return json({ error: "terms_acceptance_order_lookup_failed" }, 500);
  const acceptance = {
    commercial_terms_version: COMMERCIAL_TERMS_VERSION,
    cancellation_policy_version: CANCELLATION_POLICY_VERSION,
    accepted_at: acceptedAt,
    source: "public_checkout",
  };
  const orderMetadata = { ...(existingOrder.metadata ?? {}), commercial_acceptance: acceptance };
  const { error: orderUpdateError } = await admin.from("orders").update({ metadata: orderMetadata }).eq("id", data.order_id).eq("tenant_id", op.tenant_id);
  if (orderUpdateError) return json({ error: "terms_acceptance_order_persist_failed" }, 500);

  const { data: reservation } = await admin.from("commercial_reservations").select("id,metadata").eq("order_id", data.order_id).eq("tenant_id", op.tenant_id).limit(1).maybeSingle();
  if (reservation?.id) {
    const reservationMetadata = { ...(reservation.metadata ?? {}), commercial_acceptance: acceptance };
    const { error: reservationUpdateError } = await admin.from("commercial_reservations").update({ metadata: reservationMetadata }).eq("id", reservation.id).eq("tenant_id", op.tenant_id);
    if (reservationUpdateError) return json({ error: "terms_acceptance_reservation_persist_failed" }, 500);
  }

  return json({ ...data, checkout_token: token, payer_email: email, checkout_key: "commercial", qa_mode: allow, qa_mode_source: qaMode, commercial_acceptance: acceptance }, 201);
});
