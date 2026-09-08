import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

type DraftRequest = {
  tenant_id?: string;
  experience_id?: string;
  offering_id?: string | null;
  name?: string;
  code?: string;
  operation_kind?: "tourism" | "event" | "hybrid";
  primary_country?: string;
  primary_region?: string | null;
  primary_city?: string | null;
  timezone?: string;
  planned_start?: string;
  planned_end?: string;
  idempotency_key?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: "server_not_configured" }, 500);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "authentication_required" }, 401);

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json({ error: "authentication_required" }, 401);

  let body: DraftRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!isUuid(body.tenant_id)) return json({ error: "invalid_tenant_id" }, 400);
  if (!isUuid(body.experience_id)) return json({ error: "invalid_experience_id" }, 400);
  if (body.offering_id != null && !isUuid(body.offering_id)) return json({ error: "invalid_offering_id" }, 400);
  if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 160) return json({ error: "invalid_name" }, 400);
  if (typeof body.code !== "string" || body.code.trim().length < 3 || body.code.length > 80) return json({ error: "invalid_code" }, 400);
  if (!body.operation_kind || !["tourism", "event", "hybrid"].includes(body.operation_kind)) return json({ error: "invalid_operation_kind" }, 400);
  if (typeof body.primary_country !== "string" || body.primary_country.trim().length !== 2) return json({ error: "invalid_primary_country" }, 400);
  if (typeof body.timezone !== "string" || body.timezone.trim().length < 3) return json({ error: "invalid_timezone" }, 400);
  if (!isIsoDate(body.planned_start) || !isIsoDate(body.planned_end)) return json({ error: "invalid_planned_window" }, 400);
  if (Date.parse(body.planned_end) <= Date.parse(body.planned_start)) return json({ error: "invalid_planned_window" }, 400);
  if (typeof body.idempotency_key !== "string" || body.idempotency_key.trim().length < 8 || body.idempotency_key.length > 120) return json({ error: "invalid_idempotency_key" }, 400);

  const args: Record<string, unknown> = {
    _tenant_id: body.tenant_id,
    _experience_id: body.experience_id,
    _name: body.name.trim(),
    _code: body.code.trim().toUpperCase(),
    _operation_kind: body.operation_kind,
    _primary_country: body.primary_country.trim().toUpperCase(),
    _timezone: body.timezone.trim(),
    _planned_start: new Date(body.planned_start).toISOString(),
    _planned_end: new Date(body.planned_end).toISOString(),
    _idempotency_key: body.idempotency_key.trim(),
  };

  if (body.offering_id) args._offering_id = body.offering_id;
  if (body.primary_region?.trim()) args._primary_region = body.primary_region.trim();
  if (body.primary_city?.trim()) args._primary_city = body.primary_city.trim();

  const { data, error } = await client.rpc("create_operation", args);
  if (error) {
    const message = error.message ?? "operation_draft_failed";
    if (/permission|role|tenant/i.test(message)) return json({ error: "forbidden", details: message }, 403);
    if (/authentication/i.test(message)) return json({ error: "authentication_required", details: message }, 401);
    return json({ error: "operation_draft_failed", details: message }, 409);
  }

  return json({ ok: true, operation_id: data, status: "draft" }, 201);
});
