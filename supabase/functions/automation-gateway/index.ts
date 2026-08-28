import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isPlainObject, validateDispatchInput, validateResultInput } from "./contract.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = SUPABASE_SECRET_KEYS.default;
const n8nWebhookUrl = Deno.env.get("N8N_COMMERCIAL_WEBHOOK_URL") ?? "";
const n8nWebhookToken = Deno.env.get("N8N_WEBHOOK_TOKEN") ?? "";
const callbackToken = Deno.env.get("COBS_N8N_CALLBACK_TOKEN") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function constantTimeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function bearerToken(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function parseJson(req: Request) {
  const raw = await req.text();
  if (raw.length > 16_000) throw new Error("body_too_large");
  return JSON.parse(raw);
}

Deno.serve(async (req: Request) => {
  if (!SUPABASE_URL || !secretKey) return json({ error: "server_not_configured" }, 500);
  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("action") === "health") {
    const supplied = req.headers.get("x-n8n-callback-token") ?? "";
    if (!constantTimeEqual(supplied, callbackToken)) return json({ error: "unauthorized" }, 401);
    return json({ ok: true, service: "cobs-automation-gateway", version: 1 });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: unknown;
  try {
    body = await parseJson(req);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "invalid_json" }, 400);
  }

  const action = url.searchParams.get("action") ?? "dispatch";
  if (action === "result") {
    const supplied = req.headers.get("x-n8n-callback-token") ?? "";
    if (!constantTimeEqual(supplied, callbackToken)) return json({ error: "unauthorized" }, 401);
    const validationError = validateResultInput(body);
    if (validationError) return json({ error: validationError }, 400);
    if (!isPlainObject(body)) return json({ error: "invalid_body" }, 400);

    const resultRow = {
      tenant_id: body.tenant_id,
      automation_event_id: body.event_id,
      outcome: body.outcome,
      intent: body.outcome === "completed" ? body.intent : null,
      urgency: body.outcome === "completed" ? body.urgency : null,
      summary: body.outcome === "completed" ? body.summary : null,
      suggested_reply: body.outcome === "completed" ? body.suggested_reply : null,
      error_code:
        body.outcome === "failed" && typeof body.error_code === "string"
          ? body.error_code.slice(0, 120)
          : null,
      error_message:
        body.outcome === "failed" && typeof body.error_message === "string"
          ? body.error_message.slice(0, 1000)
          : null,
      provider_metadata: isPlainObject(body.provider_metadata) ? body.provider_metadata : {},
    };
    const { error: insertError } = await admin.from("automation_results").insert(resultRow);
    if (insertError?.code === "23505") return json({ ok: true, duplicate: true });
    if (insertError) return json({ error: "result_insert_failed" }, 500);

    const completed = body.outcome === "completed";
    const { error: updateError } = await admin
      .from("automation_events")
      .update({
        dispatch_status: completed ? "completed" : "failed",
        completed_at: completed ? new Date().toISOString() : null,
        last_error_code: completed ? null : resultRow.error_code,
        last_error_message: completed ? null : resultRow.error_message,
      })
      .eq("id", body.event_id)
      .eq("tenant_id", body.tenant_id);
    if (updateError) return json({ error: "event_update_failed" }, 500);
    return json({ ok: true, duplicate: false });
  }

  if (action !== "dispatch") return json({ error: "unsupported_action" }, 404);
  const validationError = validateDispatchInput(body);
  if (validationError) return json({ error: validationError }, 400);
  if (!isPlainObject(body)) return json({ error: "invalid_body" }, 400);
  if (!n8nWebhookUrl || !n8nWebhookToken) return json({ error: "n8n_not_configured" }, 503);

  const accessToken = bearerToken(req);
  if (!accessToken) return json({ error: "missing_user_token" }, 401);
  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  const userId = authData.user?.id;
  if (authError || !userId) return json({ error: "invalid_user_token" }, 401);

  const tenantId = String(body.tenant_id);
  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("profile_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) return json({ error: "membership_lookup_failed" }, 500);
  if (!membership) return json({ error: "forbidden" }, 403);

  const correlationId = crypto.randomUUID();
  const row = {
    tenant_id: tenantId,
    operation_id: body.operation_id ?? null,
    actor_profile_id: userId,
    event_type: body.event_type,
    source: "cobs_app",
    idempotency_key: String(body.idempotency_key).trim(),
    correlation_id: correlationId,
    payload: body.payload,
  };
  const { data: event, error: insertError } = await admin
    .from("automation_events")
    .insert(row)
    .select(
      "id,tenant_id,operation_id,event_type,idempotency_key,correlation_id,payload,created_at",
    )
    .single();

  if (insertError?.code === "23505") {
    const { data: existing } = await admin
      .from("automation_events")
      .select("id,dispatch_status,correlation_id")
      .eq("tenant_id", tenantId)
      .eq("source", "cobs_app")
      .eq("idempotency_key", row.idempotency_key)
      .maybeSingle();
    return json({ ok: true, duplicate: true, event: existing });
  }
  if (insertError || !event) return json({ error: "event_insert_failed" }, 500);

  let response: Response;
  try {
    response = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cobs-webhook-token": n8nWebhookToken },
      body: JSON.stringify({ schema_version: 1, ...event }),
    });
  } catch {
    await admin
      .from("automation_events")
      .update({
        dispatch_status: "failed",
        dispatch_attempts: 1,
        last_error_code: "n8n_network_error",
        last_error_message: "Unable to reach automation orchestrator",
      })
      .eq("id", event.id);
    return json({ error: "n8n_network_error", event_id: event.id }, 502);
  }

  if (!response.ok) {
    await admin
      .from("automation_events")
      .update({
        dispatch_status: "failed",
        dispatch_attempts: 1,
        last_error_code: `n8n_http_${response.status}`,
        last_error_message: "Automation orchestrator rejected dispatch",
      })
      .eq("id", event.id);
    return json({ error: "n8n_dispatch_rejected", event_id: event.id }, 502);
  }

  await admin
    .from("automation_events")
    .update({
      dispatch_status: "dispatched",
      dispatch_attempts: 1,
      dispatched_at: new Date().toISOString(),
      last_error_code: null,
      last_error_message: null,
    })
    .eq("id", event.id);
  await admin.from("audit_events").insert({
    tenant_id: tenantId,
    actor_profile_id: userId,
    action: "automation.dispatch",
    subject_type: "automation_event",
    subject_id: event.id,
    correlation_id: correlationId,
    metadata: { event_type: body.event_type, orchestrator: "n8n" },
  });
  return json(
    { ok: true, duplicate: false, event_id: event.id, correlation_id: correlationId },
    202,
  );
});
