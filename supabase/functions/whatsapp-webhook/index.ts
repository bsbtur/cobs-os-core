import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = SUPABASE_SECRET_KEYS.default;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  if (!secretKey) return json({ error: "server_not_configured" }, 500);
  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !token || !challenge) return new Response("Forbidden", { status: 403 });
    const { data: valid, error } = await admin.rpc("w07_verify_meta_webhook_token", { _token: token });
    if (error || valid !== true) return new Response("Forbidden", { status: 403 });
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const { data: signatureValid, error: signatureError } = await admin.rpc("w07_verify_meta_signature", {
    _raw_body: rawBody,
    _signature: signature,
  });
  if (signatureError || signatureValid !== true) return json({ error: "invalid_signature" }, 401);

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return json({ error: "invalid_json" }, 400); }

  const results: unknown[] = [];
  let statusEvents = 0;
  let inboundMessages = 0;

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      for (const status of value?.statuses ?? []) {
        const providerMessageId = status?.id != null ? String(status.id) : null;
        const eventType = status?.status != null ? String(status.status) : null;
        if (!providerMessageId || !["sent","delivered","read","failed"].includes(eventType)) continue;
        const occurredAt = status?.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
        const providerEventId = `${providerMessageId}:${eventType}:${status?.timestamp ?? "na"}`;
        const { data, error } = await admin.rpc("w07_ingest_whatsapp_provider_status", {
          _provider_message_id: providerMessageId,
          _provider_event_id: providerEventId,
          _event_type: eventType,
          _occurred_at: occurredAt,
        });
        statusEvents++;
        results.push(error ? { provider_message_id: providerMessageId, event_type: eventType, error: error.message } : data);
      }

      // Inbound messages are counted here so the webhook contract is already compatible.
      // Persistence/conversation routing is intentionally deferred to the inbound-message gate.
      inboundMessages += Array.isArray(value?.messages) ? value.messages.length : 0;
    }
  }

  return json({ ok: true, signature_valid: true, status_events: statusEvents, inbound_messages_seen: inboundMessages, results });
});