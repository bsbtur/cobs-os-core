import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = SUPABASE_SECRET_KEYS.default;
const n8nWebhookUrl = Deno.env.get("N8N_COMMERCIAL_WEBHOOK_URL") ?? "";
const n8nWebhookToken = Deno.env.get("N8N_WEBHOOK_TOKEN") ?? "";
const dispatcherToken = Deno.env.get("COBS_AUTOMATION_DISPATCHER_TOKEN") ?? "";

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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !secretKey || !n8nWebhookUrl || !n8nWebhookToken || !dispatcherToken) {
    return json({ error: "server_not_configured" }, 500);
  }

  const supplied = req.headers.get("x-cobs-dispatcher-token") ?? "";
  if (!constantTimeEqual(supplied, dispatcherToken)) return json({ error: "unauthorized" }, 401);

  let requestedLimit = 10;
  try {
    const body = await req.json();
    if (Number.isFinite(Number(body?.limit))) requestedLimit = Number(body.limit);
  } catch {
    // Empty body is valid.
  }
  const limit = Math.max(1, Math.min(50, Math.trunc(requestedLimit)));
  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });

  const { data: events, error: claimError } = await admin.schema("app_private").rpc(
    "claim_automation_outbox",
    { _limit: limit },
  );
  if (claimError) return json({ error: "outbox_claim_failed" }, 500);

  const summary = { claimed: 0, dispatched: 0, failed: 0 };
  const failures: Array<{ event_id: string; code: string }> = [];

  for (const event of events ?? []) {
    summary.claimed++;
    try {
      const response = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cobs-webhook-token": n8nWebhookToken,
        },
        body: JSON.stringify({
          schema_version: 1,
          id: event.id,
          tenant_id: event.tenant_id,
          operation_id: event.operation_id,
          event_type: event.event_type,
          idempotency_key: event.idempotency_key,
          correlation_id: event.correlation_id,
          payload: event.payload,
          created_at: event.created_at,
        }),
      });

      if (!response.ok) {
        const code = `n8n_http_${response.status}`;
        await admin
          .from("automation_events")
          .update({
            dispatch_status: "failed",
            last_error_code: code,
            last_error_message: "Automation orchestrator rejected dispatch",
          })
          .eq("id", event.id)
          .eq("dispatch_status", "processing");
        summary.failed++;
        failures.push({ event_id: event.id, code });
        continue;
      }

      await admin
        .from("automation_events")
        .update({
          dispatch_status: "dispatched",
          dispatched_at: new Date().toISOString(),
          last_error_code: null,
          last_error_message: null,
        })
        .eq("id", event.id)
        .eq("dispatch_status", "processing");

      await admin.from("audit_events").insert({
        tenant_id: event.tenant_id,
        actor_profile_id: event.actor_profile_id,
        action: "automation.dispatch",
        subject_type: "automation_event",
        subject_id: event.id,
        correlation_id: event.correlation_id,
        metadata: { event_type: event.event_type, orchestrator: "n8n", source: "cobs_db" },
      });
      summary.dispatched++;
    } catch {
      const code = "n8n_network_error";
      await admin
        .from("automation_events")
        .update({
          dispatch_status: "failed",
          last_error_code: code,
          last_error_message: "Unable to reach automation orchestrator",
        })
        .eq("id", event.id)
        .eq("dispatch_status", "processing");
      summary.failed++;
      failures.push({ event_id: event.id, code });
    }
  }

  return json({ ok: true, summary, failures });
});
