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
function normalizePhone(value?: string) {
  if (!value) return null;
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (!raw) return null;
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return raw;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SECRET_KEY) return json({ error: "server_not_configured" }, 500);

  let body: {
    full_name?: string;
    email?: string;
    phone?: string;
    idempotency_key?: string;
    qa_terms_accepted?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const fullName = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  const idempotencyKey = (body.idempotency_key ?? crypto.randomUUID()).trim();

  if (fullName.length < 2 || fullName.length > 120) return json({ error: "invalid_full_name" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "invalid_email" }, 400);
  if (phone && !/^\+[1-9][0-9]{7,14}$/.test(phone)) return json({ error: "invalid_phone" }, 400);
  if (idempotencyKey.length < 16 || idempotencyKey.length > 120) return json({ error: "invalid_idempotency_key" }, 400);
  if (body.qa_terms_accepted !== true) return json({ error: "qa_terms_acceptance_required" }, 400);

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const checkoutToken = [...tokenBytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(checkoutToken);
  const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

  const { data, error } = await admin.rpc("create_citytour_test_checkout_order", {
    _operation_code: OPERATION_CODE,
    _fixture_key: FIXTURE_KEY,
    _full_name: fullName,
    _email: email,
    _phone_e164: phone,
    _checkout_token_hash: tokenHash,
    _idempotency_key: idempotencyKey,
  });

  if (error) {
    const message = error.message ?? "checkout_order_failed";
    if (message.includes("capacity reached")) return json({ error: "qa_capacity_reached" }, 409);
    return json({ error: "checkout_order_failed", details: message }, 409);
  }
  if (!data?.order_id) return json({ error: "checkout_order_missing" }, 500);

  if (data.reused === true && data.session_id) {
    const { data: rotated, error: rotateError } = await admin
      .from("public_checkout_sessions")
      .update({ token_hash: tokenHash, status: "active", expires_at: new Date(Date.now() + 7_200_000).toISOString() })
      .eq("id", data.session_id)
      .eq("order_id", data.order_id)
      .select("id")
      .maybeSingle();
    if (rotateError || !rotated) return json({ error: "checkout_session_rotation_failed" }, 409);
  }

  return json(
    {
      ...data,
      checkout_token: checkoutToken,
      payer_email: email,
      environment: "test",
      fixture_key: FIXTURE_KEY,
      qa_terms: {
        version: "citytour-r1-qa-v1",
        accepted_at: new Date().toISOString(),
        legal_effect: false,
      },
    },
    data.reused === true ? 200 : 201,
  );
});
