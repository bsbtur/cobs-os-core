import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SECRET = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
const WEBHOOK_SECRET = (Deno.env.get("CLICKSIGN_WEBHOOK_SECRET") ?? "").trim();
const enc = new TextEncoder();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const hex = (a: ArrayBuffer) => Array.from(new Uint8Array(a)).map((b) => b.toString(16).padStart(2, "0")).join("");
async function hmac(body: string) { const key = await crypto.subtle.importKey("raw", enc.encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return hex(await crypto.subtle.sign("HMAC", key, enc.encode(body))); }
async function sha(v: string) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(v))); }
function safeEq(a: string, b: string) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
function eventName(req: Request, p: any) { return String(req.headers.get("event") ?? p?.event?.name ?? p?.event ?? p?.data?.attributes?.name ?? p?.name ?? "unknown"); }
function envelopeId(p: any) { return p?.envelope?.id ?? p?.envelope?.key ?? p?.event?.data?.envelope?.id ?? p?.event?.data?.envelope?.key ?? p?.event?.envelope_id ?? p?.data?.relationships?.envelope?.data?.id ?? p?.data?.attributes?.envelope_id ?? null; }
function mapEvent(name: string) {
  const n = name.toLowerCase().trim();
  if (n === "sign" || n === "signed" || n.includes("document_signed") || n.includes("signature_completed") || n.includes("signature_finished")) return { event: "signed", status: "signed" } as const;
  if (n.includes("signature_started") || n.includes("view") || n.includes("access")) return { event: "viewed", status: "viewed" } as const;
  if (n.includes("cancel")) return { event: "cancelled", status: "cancelled" } as const;
  if (n.includes("expire") || n.includes("deadline")) return { event: "expired", status: "expired" } as const;
  if (n.includes("activat") || n.includes("notification") || n.includes("request_signature")) return { event: "sent", status: "sent" } as const;
  if (n === "close" || n === "auto_close" || n === "document_closed" || n.includes("envelope_closed") || n.includes("finish") || n.includes("complete")) return { event: "completed", status: null } as const;
  return null;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!SECRET) return json({ error: "supabase_secret_not_available" }, 500);
    if (!WEBHOOK_SECRET) return json({ error: "clicksign_webhook_not_configured" }, 503);
    const raw = await req.text();
    const provided = (req.headers.get("x-clicksign-signature") ?? req.headers.get("content-hmac") ?? "").replace(/^sha256=/i, "").trim().toLowerCase();
    const expected = await hmac(raw);
    if (!provided || !safeEq(provided, expected)) return json({ error: "invalid_signature" }, 401);
    let payload: any; try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
    const name = eventName(req, payload);
    const mapped = mapEvent(name);
    if (!mapped) return json({ ok: true, ignored: true, reason: "unsupported_event", event: name }, 202);
    const envId = envelopeId(payload);
    if (!envId) return json({ ok: true, ignored: true, reason: "envelope_id_missing", event: name }, 202);
    const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
    const { data: contract, error: lookupError } = await admin.from("customer_contracts").select("id,tenant_id,status,provider_envelope_id,metadata,sent_at,viewed_at,signed_at,cancelled_at").eq("provider", "clicksign").eq("provider_envelope_id", String(envId)).maybeSingle();
    if (lookupError) return json({ error: "contract_lookup_failed" }, 500);
    if (!contract) return json({ ok: true, ignored: true, reason: "contract_not_found", event: name }, 202);
    const providerEventId = `clicksign:${await sha(name + "\n" + raw)}`;
    const { error: eventError } = await admin.from("contract_events").insert({ tenant_id: contract.tenant_id, contract_id: contract.id, event_type: mapped.event, provider_event_id: providerEventId, source: "provider", payload: { event: name, body: payload } });
    if (eventError?.code === "23505") return json({ ok: true, idempotent: true, event: name });
    if (eventError) return json({ error: "event_insert_failed" }, 500);
    if (mapped.status) {
      const current = String(contract.status ?? "draft");
      const terminal = ["signed", "cancelled", "expired", "superseded"].includes(current);
      if (!terminal || current === mapped.status) {
        const now = new Date().toISOString();
        const patch: Record<string, unknown> = { status: mapped.status, metadata: { ...(contract.metadata ?? {}), last_clicksign_event: name, last_clicksign_event_at: now } };
        if (mapped.status === "sent" && !contract.sent_at) patch.sent_at = now;
        if (mapped.status === "viewed" && !contract.viewed_at) patch.viewed_at = now;
        if (mapped.status === "signed" && !contract.signed_at) patch.signed_at = now;
        if (mapped.status === "cancelled" && !contract.cancelled_at) patch.cancelled_at = now;
        const { error } = await admin.from("customer_contracts").update(patch).eq("id", contract.id);
        if (error) return json({ error: "contract_update_failed" }, 500);
      }
    }
    return json({ ok: true, contract_id: contract.id, event: name, status: mapped.status });
  } catch (e) { console.error("contracts-clicksign-webhook", String(e)); return json({ error: "webhook_internal_error" }, 500); }
});
