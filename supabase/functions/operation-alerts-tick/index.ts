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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !secretKey || !callbackToken) return json({ error: "server_not_configured" }, 500);

  const supplied = req.headers.get("x-n8n-callback-token") ?? "";
  if (!constantTimeEqual(supplied, callbackToken)) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!isUuid(body.tenant_id)) return json({ error: "invalid_tenant_id" }, 400);

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const args: Record<string, unknown> = { _tenant_id: body.tenant_id };
  if (typeof body.window_start === "string" && body.window_start.trim()) args._window_start = body.window_start;
  if (typeof body.window_end === "string" && body.window_end.trim()) args._window_end = body.window_end;

  const { data, error } = await admin.rpc("generate_due_staff_journey_alerts", args);
  if (error) return json({ error: "alert_generation_failed", detail: error.message.slice(0, 500) }, 500);

  return json({ ok: true, workflow: "cobs-operation-alerts-tick-v1", result: data });
});