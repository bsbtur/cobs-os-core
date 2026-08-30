import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = SUPABASE_SECRET_KEYS.default;
const callbackToken = Deno.env.get("COBS_N8N_CALLBACK_TOKEN") ?? "";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function constantTimeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

Deno.serve(async (req: Request) => {
  if (!SUPABASE_URL || !secretKey) return json({ error: "server_not_configured" }, 500);
  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("action") === "health") {
    const supplied = req.headers.get("x-n8n-callback-token") ?? "";
    if (!constantTimeEqual(supplied, callbackToken)) return json({ error: "unauthorized" }, 401);
    return json({ ok: true, service: "cobs-automation-gateway", version: 1, event_type: "lead.created" });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (url.searchParams.get("action") !== "result") return json({ error: "unsupported_action" }, 404);

  const supplied = req.headers.get("x-n8n-callback-token") ?? "";
  if (!constantTimeEqual(supplied, callbackToken)) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 16000) return json({ error: "body_too_large" }, 400);
    body = JSON.parse(raw);
  } catch { return json({ error: "invalid_json" }, 400); }

  if (!isPlainObject(body)) return json({ error: "invalid_body" }, 400);
  if (!isUuid(body.event_id) || !isUuid(body.tenant_id)) return json({ error: "invalid_event_reference" }, 400);
  if (body.outcome !== "completed" && body.outcome !== "failed") return json({ error: "invalid_outcome" }, 400);

  const { data: storedEvent, error: lookupError } = await admin.from("automation_events")
    .select("id,tenant_id,event_type").eq("id", body.event_id).eq("tenant_id", body.tenant_id).maybeSingle();
  if (lookupError) return json({ error: "event_lookup_failed" }, 500);
  if (!storedEvent) return json({ error: "automation_event_not_found" }, 404);
  if (storedEvent.event_type !== "lead.created") return json({ error: "unsupported_event_type" }, 400);

  const completed = body.outcome === "completed";
  const allowedIntents = new Set(["price","installment","group","ready_to_buy","human_support","other"]);
  const allowedUrgencies = new Set(["low","medium","high"]);
  if (completed) {
    if (typeof body.intent !== "string" || !allowedIntents.has(body.intent)) return json({ error: "invalid_intent" }, 400);
    if (typeof body.urgency !== "string" || !allowedUrgencies.has(body.urgency)) return json({ error: "invalid_urgency" }, 400);
    if (typeof body.summary !== "string" || body.summary.length > 500) return json({ error: "invalid_summary" }, 400);
    if (typeof body.suggested_reply !== "string" || body.suggested_reply.length > 600) return json({ error: "invalid_suggested_reply" }, 400);
  }

  const resultRow = {
    tenant_id: body.tenant_id,
    automation_event_id: body.event_id,
    outcome: body.outcome,
    intent: completed ? body.intent : null,
    urgency: completed ? body.urgency : null,
    summary: completed ? body.summary : null,
    suggested_reply: completed ? body.suggested_reply : null,
    error_code: body.outcome === "failed" && typeof body.error_code === "string" ? body.error_code.slice(0,120) : null,
    error_message: body.outcome === "failed" && typeof body.error_message === "string" ? body.error_message.slice(0,1000) : null,
    provider_metadata: isPlainObject(body.provider_metadata) ? body.provider_metadata : {},
  };

  const { error: insertError } = await admin.from("automation_results").insert(resultRow);
  if (insertError?.code === "23505") return json({ ok: true, duplicate: true });
  if (insertError) return json({ error: "result_insert_failed" }, 500);

  const { error: updateError } = await admin.from("automation_events").update({
    dispatch_status: completed ? "completed" : "failed",
    completed_at: completed ? new Date().toISOString() : null,
    last_error_code: completed ? null : resultRow.error_code,
    last_error_message: completed ? null : resultRow.error_message,
  }).eq("id", body.event_id).eq("tenant_id", body.tenant_id);
  if (updateError) return json({ error: "event_update_failed" }, 500);
  return json({ ok: true, duplicate: false });
});
