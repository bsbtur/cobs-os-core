import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SECRET_KEY = SECRET_KEYS.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const OPERATION_ID = "0cf5d7fa-4d89-428a-9fec-0906ebc188d0";
const EXPERIENCE_ID = "7a02eb60-4c41-4e13-bdf6-d0cf12ff0549";
const SOURCE = "piri_experience_2027";
const CAMPAIGN = "piri-experience-2027";
const ENDPOINT_NAME = "piri-public-lead-capture";
const ALLOWED_ORIGINS = new Set([
  "https://id-preview--7979db8c-7e32-49be-a0e0-11fc4dc26021.lovable.app",
  "https://piri-premium-preview.lovable.app",
]);

function corsFor(origin: string | null) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, idempotency-key",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function normalizePhone(value?: string) {
  if (!value) return null;
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return null;
}

function clientIp(req: Request) {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

async function hashKey(value: string) {
  const bytes = new TextEncoder().encode(`${SECRET_KEY}|${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function consumeLimit(
  admin: ReturnType<typeof createClient>,
  keyHash: string,
  limit: number,
  windowSeconds: number,
) {
  const { data, error } = await admin.rpc("consume_public_endpoint_rate_limit", {
    _endpoint: ENDPOINT_NAME,
    _key_hash: keyHash,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error("piri_rate_limit_failed", error);
    throw new Error("rate_limit_failed");
  }
  const row = Array.isArray(data) ? data[0] : data;
  return Boolean(row?.allowed);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = corsFor(origin);

  if (req.method === "OPTIONS") {
    if (!cors) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }

  if (!cors) return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
    status: 403,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (!SUPABASE_URL || !SECRET_KEY) return json({ error: "server_not_configured" }, 500, cors);

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 32768) {
    return json({ error: "payload_too_large" }, 413, cors);
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return json({ error: "invalid_body" }, 400, cors);
  }
  if (raw.length > 32768) return json({ error: "payload_too_large" }, 413, cors);

  let body: {
    full_name?: string;
    email?: string;
    phone?: string;
    city?: string;
    party_size?: number;
    observation?: string;
    consent_contact?: boolean;
    operation_id?: string;
    experience_id?: string;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const idempotencyKey = (req.headers.get("idempotency-key") ?? "").trim();
  const fullName = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  const city = (body.city ?? "").trim();
  const partySize = Number(body.party_size);
  const observation = (body.observation ?? "").trim();
  const consentContact = body.consent_contact === true;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return json({ error: "invalid_idempotency_key" }, 400, cors);
  }
  if (fullName.length < 2 || fullName.length > 120) return json({ error: "invalid_full_name" }, 400, cors);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: "invalid_email" }, 400, cors);
  }
  if (!phone) return json({ error: "invalid_phone" }, 400, cors);
  if (city.length < 2 || city.length > 100) return json({ error: "invalid_city" }, 400, cors);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
    return json({ error: "invalid_party_size" }, 400, cors);
  }
  if (observation.length > 1000) return json({ error: "observation_too_long" }, 400, cors);
  if (!consentContact) return json({ error: "contact_consent_required" }, 400, cors);
  if (body.operation_id && body.operation_id !== OPERATION_ID) return json({ error: "operation_mismatch" }, 400, cors);
  if (body.experience_id && body.experience_id !== EXPERIENCE_ID) return json({ error: "experience_mismatch" }, 400, cors);

  const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

  const { data: op, error: opError } = await admin
    .from("operations")
    .select("id,tenant_id,experience_id,code,archived_at")
    .eq("id", OPERATION_ID)
    .is("archived_at", null)
    .maybeSingle();

  if (opError) {
    console.error("piri_operation_lookup_failed", opError);
    return json({ error: "operation_lookup_failed" }, 500, cors);
  }
  if (!op?.tenant_id || op.experience_id !== EXPERIENCE_ID) {
    return json({ error: "lead_capture_not_configured" }, 409, cors);
  }

  const { data: existing, error: existingError } = await admin
    .from("commercial_leads")
    .select("id,status,created_at")
    .eq("tenant_id", op.tenant_id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError) {
    console.error("piri_idempotency_lookup_failed", existingError);
    return json({ error: "idempotency_lookup_failed" }, 500, cors);
  }
  if (existing) return json({ ok: true, ...existing, duplicate: true }, 200, cors);

  try {
    const ipAllowed = await consumeLimit(
      admin,
      await hashKey(`ip:${clientIp(req)}`),
      30,
      600,
    );
    if (!ipAllowed) return json({ error: "rate_limited" }, 429, cors);

    const emailAllowed = await consumeLimit(
      admin,
      await hashKey(`email:${email}`),
      5,
      3600,
    );
    if (!emailAllowed) return json({ error: "rate_limited" }, 429, cors);
  } catch {
    return json({ error: "rate_limit_unavailable" }, 503, cors);
  }

  const { data: inserted, error: insertError } = await admin
    .from("commercial_leads")
    .insert({
      tenant_id: op.tenant_id,
      experience_id: EXPERIENCE_ID,
      operation_id: OPERATION_ID,
      full_name: fullName,
      email,
      phone,
      source: SOURCE,
      campaign: CAMPAIGN,
      status: "new",
      consent_contact: true,
      consent_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      metadata: {
        city,
        party_size: partySize,
        observation,
        event_type: "lead.created",
        product: "piri_experience_2027",
        sales_mode: "priority_list",
        landing_origin: origin,
        consent_version: "piri-priority-list-v1",
        creates_order: false,
        creates_payment: false,
        sales_public: false,
      },
    })
    .select("id,status,created_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: duplicate } = await admin
        .from("commercial_leads")
        .select("id,status,created_at")
        .eq("tenant_id", op.tenant_id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (duplicate) return json({ ok: true, ...duplicate, duplicate: true }, 200, cors);
    }
    console.error("piri_commercial_lead_insert_failed", insertError);
    return json({ error: "lead_capture_failed" }, 500, cors);
  }

  return json({ ok: true, ...inserted, duplicate: false }, 201, cors);
});
