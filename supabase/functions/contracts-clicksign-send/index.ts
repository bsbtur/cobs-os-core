import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUB = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
const SEC = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
const TOKEN = (Deno.env.get("CLICKSIGN_ACCESS_TOKEN") ?? "").trim();
const BASE = (Deno.env.get("CLICKSIGN_BASE_URL") ?? "https://sandbox.clicksign.com/api/v3").replace(/\/$/, "");
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
function b64(bytes: Uint8Array) { let out = ""; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length))); return btoa(out); }
type M = "GET" | "POST" | "PATCH";
async function cs(path: string, method: M = "POST", body?: unknown) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { authorization: TOKEN, accept: "application/vnd.api+json", "content-type": "application/vnd.api+json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let data: any = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(`clicksign_${r.status}:${JSON.stringify(data).slice(0, 800)}`);
  return { status: r.status, data };
}
async function stage<T>(name: string, fn: () => Promise<T>) { try { return await fn(); } catch (e) { throw new Error(`${name}::${String(e)}`); } }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    if (!PUB || !SEC) return json({ error: "supabase_keys_not_available" }, 500);
    if (!TOKEN) return json({ error: "clicksign_not_configured" }, 503);
    const auth = req.headers.get("authorization"); if (!auth) return json({ error: "authorization_required" }, 401);
    const userClient = createClient(SUPABASE_URL, PUB, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: ud, error: ue } = await userClient.auth.getUser(); if (ue || !ud.user) return json({ error: "invalid_session" }, 401);
    let input: { contract_id?: string }; try { input = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const contractId = input.contract_id?.trim(); if (!contractId) return json({ error: "contract_id_required" }, 400);
    const admin = createClient(SUPABASE_URL, SEC, { auth: { persistSession: false } });
    const { data: c, error: ce } = await admin.from("customer_contracts").select("id,tenant_id,customer_person_id,status,original_document_path,provider_envelope_id,signer_name,signer_document,expires_at,metadata,sent_at").eq("id", contractId).eq("provider", "clicksign").maybeSingle();
    if (ce) return json({ error: "contract_lookup_failed" }, 500); if (!c) return json({ error: "contract_not_found" }, 404);
    const { data: m } = await admin.from("memberships").select("role").eq("tenant_id", c.tenant_id).eq("profile_id", ud.user.id).eq("status", "active").maybeSingle();
    if (!m || !["owner", "admin", "operations_agent"].includes(m.role)) return json({ error: "forbidden" }, 403);
    if (c.status === "sent" && c.provider_envelope_id) return json({ ok: true, idempotent: true, contract_id: c.id, status: "sent", provider_envelope_id: c.provider_envelope_id }, 200);
    if (c.status !== "draft") return json({ error: "contract_not_draft", status: c.status }, 409);
    if (!c.original_document_path) return json({ error: "original_document_missing" }, 409);
    const { data: p } = await admin.from("people").select("full_name,email").eq("id", c.customer_person_id).maybeSingle(); if (!p?.email) return json({ error: "customer_email_required" }, 409);
    const { data: file, error: de } = await admin.storage.from("customer-contracts").download(c.original_document_path); if (de || !file) return json({ error: "contract_pdf_download_failed" }, 500);
    const bytes = new Uint8Array(await file.arrayBuffer()); if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return json({ error: "contract_pdf_invalid" }, 422);
    let envelopeId = c.provider_envelope_id as string | null;
    const meta = { ...(c.metadata ?? {}) } as Record<string, any>;
    try {
      if (!envelopeId) {
        const env: any = await stage("envelope_create", () => cs("/envelopes", "POST", { data: { type: "envelopes", attributes: { name: `COBS Contrato ${c.id}`, locale: "pt-BR", auto_close: true, ...(c.expires_at ? { deadline_at: c.expires_at } : {}) } } }));
        envelopeId = env.data?.data?.id; if (!envelopeId) throw new Error("envelope_create::id_missing");
        meta.clicksign_environment = BASE.includes("sandbox") ? "sandbox" : "production"; meta.envelope_created_at = new Date().toISOString();
        const { error } = await admin.from("customer_contracts").update({ provider_envelope_id: envelopeId, metadata: meta }).eq("id", c.id); if (error) throw new Error(`db_link_envelope::${error.message}`);
      }
      let documentId = meta.clicksign_document_id as string | undefined;
      if (!documentId) {
        const doc: any = await stage("document_upload", () => cs(`/envelopes/${encodeURIComponent(envelopeId!)}/documents`, "POST", { data: { type: "documents", attributes: { filename: `contrato-${c.id}.pdf`, content_base64: `data:application/pdf;base64,${b64(bytes)}` } } }));
        documentId = doc.data?.data?.id; if (!documentId) throw new Error("document_upload::id_missing"); meta.clicksign_document_id = documentId;
        const { error } = await admin.from("customer_contracts").update({ metadata: meta }).eq("id", c.id); if (error) throw new Error(`db_link_document::${error.message}`);
      }
      let signerId = meta.clicksign_signer_id as string | undefined;
      if (!signerId) {
        const signer: any = await stage("signer_create", () => cs(`/envelopes/${encodeURIComponent(envelopeId!)}/signers`, "POST", { data: { type: "signers", attributes: { name: c.signer_name || p.full_name, email: p.email, ...(c.signer_document ? { documentation: c.signer_document } : {}), communicate_events: { signature_request: "email", signature_reminder: "email", document_signed: "email" } } } }));
        signerId = signer.data?.data?.id; if (!signerId) throw new Error("signer_create::id_missing"); meta.clicksign_signer_id = signerId;
        const { error } = await admin.from("customer_contracts").update({ metadata: meta }).eq("id", c.id); if (error) throw new Error(`db_link_signer::${error.message}`);
      }
      const rel = { document: { data: { type: "documents", id: documentId } }, signer: { data: { type: "signers", id: signerId } } };
      if (!meta.clicksign_qualification_done) { await stage("requirement_qualification", () => cs(`/envelopes/${encodeURIComponent(envelopeId!)}/requirements`, "POST", { data: { type: "requirements", attributes: { action: "agree", role: "sign" }, relationships: rel } })); meta.clicksign_qualification_done = true; const { error } = await admin.from("customer_contracts").update({ metadata: meta }).eq("id", c.id); if (error) throw new Error(`db_qualification::${error.message}`); }
      if (!meta.clicksign_auth_requirement_done) { await stage("requirement_auth", () => cs(`/envelopes/${encodeURIComponent(envelopeId!)}/requirements`, "POST", { data: { type: "requirements", attributes: { action: "provide_evidence", auth: "email" }, relationships: rel } })); meta.clicksign_auth_requirement_done = true; const { error } = await admin.from("customer_contracts").update({ metadata: meta }).eq("id", c.id); if (error) throw new Error(`db_auth_requirement::${error.message}`); }
      if (!meta.clicksign_activation_done) { await stage("activate", () => cs(`/envelopes/${encodeURIComponent(envelopeId!)}`, "PATCH", { data: { id: envelopeId, type: "envelopes", attributes: { status: "running" } } })); meta.clicksign_activation_done = true; meta.activation_requested_at = new Date().toISOString(); const { error } = await admin.from("customer_contracts").update({ metadata: meta }).eq("id", c.id); if (error) throw new Error(`db_activation::${error.message}`); }
      if (!meta.clicksign_notification_done) { await stage("notify", () => cs(`/envelopes/${encodeURIComponent(envelopeId!)}/notifications`, "POST", { data: { type: "notifications", attributes: {} } })); meta.clicksign_notification_done = true; meta.notification_requested_at = new Date().toISOString(); const { error } = await admin.from("customer_contracts").update({ metadata: meta }).eq("id", c.id); if (error) throw new Error(`db_notification::${error.message}`); }
      const sentAt = c.sent_at ?? new Date().toISOString();
      const { error: updateError } = await admin.from("customer_contracts").update({ status: "sent", sent_at: sentAt, metadata: { ...meta, clicksign_send_error: null, clicksign_send_error_stage: null } }).eq("id", c.id).eq("status", "draft"); if (updateError) throw new Error(`db_mark_sent::${updateError.message}`);
      const { error: eventError } = await admin.from("contract_events").insert({ tenant_id: c.tenant_id, contract_id: c.id, event_type: "sent", provider_event_id: `cobs:clicksign:sent:${c.id}`, source: "cobs", payload: { provider: "clicksign", provider_envelope_id: envelopeId, provider_document_id: documentId, provider_signer_id: signerId } }); if (eventError && eventError.code !== "23505") throw new Error(`db_sent_event::${eventError.message}`);
      return json({ ok: true, contract_id: c.id, provider: "clicksign", provider_envelope_id: envelopeId, status: "sent" }, 202);
    } catch (e) {
      const msg = String(e); const stageName = msg.includes("::") ? msg.split("::")[0].replace(/^Error: /, "") : "provider_flow"; console.error(`contracts-clicksign-send stage=${stageName}`, msg);
      await admin.from("customer_contracts").update({ provider_envelope_id: envelopeId, metadata: { ...meta, clicksign_send_error: msg.slice(0, 1200), clicksign_send_error_stage: stageName, clicksign_send_error_at: new Date().toISOString() } }).eq("id", c.id);
      await admin.from("contract_events").insert({ tenant_id: c.tenant_id, contract_id: c.id, event_type: "provider_error", source: "system", payload: { stage: stageName, provider_envelope_id: envelopeId } });
      return json({ error: "clicksign_send_failed", stage: stageName, provider_envelope_id: envelopeId }, 502);
    }
  } catch (e) { console.error("contracts-clicksign-send", String(e)); return json({ error: "internal_error" }, 500); }
});
