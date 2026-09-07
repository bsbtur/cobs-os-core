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
type M = "POST" | "PATCH";
async function cs(path: string, method: M, body: unknown) { const r = await fetch(`${BASE}${path}`, { method, headers: { authorization: TOKEN, accept: "application/vnd.api+json", "content-type": "application/vnd.api+json" }, body: JSON.stringify(body) }); const text = await r.text(); let data: any = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; } if (!r.ok) throw new Error(`clicksign_${r.status}`); return data; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    if (!PUB || !SEC) return json({ error: "supabase_keys_not_available" }, 500);
    const auth = req.headers.get("authorization"); if (!auth) return json({ error: "authorization_required" }, 401);
    const userClient = createClient(SUPABASE_URL, PUB, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: ud, error: ue } = await userClient.auth.getUser(); if (ue || !ud.user) return json({ error: "invalid_session" }, 401);
    let input: { contract_id?: string }; try { input = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const contractId = input.contract_id?.trim(); if (!contractId) return json({ error: "contract_id_required" }, 400);
    const admin = createClient(SUPABASE_URL, SEC, { auth: { persistSession: false } });
    const { data: c, error: ce } = await admin.from("customer_contracts").select("id,tenant_id,customer_person_id,status,template_key,template_version,original_document_path,provider_envelope_id,signer_name,signer_document,expires_at,metadata,sent_at").eq("id", contractId).eq("provider", "clicksign").maybeSingle();
    if (ce) return json({ error: "contract_lookup_failed" }, 500); if (!c) return json({ error: "contract_not_found" }, 404);
    const { data: m } = await admin.from("memberships").select("role").eq("tenant_id", c.tenant_id).eq("profile_id", ud.user.id).eq("status", "active").maybeSingle();
    if (!m || !["owner", "admin", "operations_agent"].includes(m.role)) return json({ error: "forbidden" }, 403);
    if (c.status === "sent" && c.provider_envelope_id) return json({ ok: true, idempotent: true, contract_id: c.id, status: "sent", provider_envelope_id: c.provider_envelope_id });
    if (c.status !== "draft") return json({ error: "contract_not_draft", status: c.status }, 409);

    const { data: template, error: templateError } = await admin
      .from("contract_templates")
      .select("id,status,legal_reviewed_at")
      .eq("tenant_id", c.tenant_id)
      .eq("template_key", c.template_key)
      .eq("version", c.template_version)
      .eq("status", "active")
      .maybeSingle();
    if (templateError) return json({ error: "contract_template_lookup_failed" }, 500);
    if (!template?.legal_reviewed_at)
      return json({ error: "contract_provider_send_locked", reason: "formal_legal_validation_required" }, 423);

    if (!c.original_document_path) return json({ error: "original_document_missing" }, 409);
    if (!TOKEN) return json({ error: "clicksign_not_configured" }, 503);

    const meta = { ...(c.metadata ?? {}) } as Record<string, any>;
    const uncertain = ["envelope", "document", "signer", "qualification", "auth_requirement", "activation", "notification"].find((s) => meta[`clicksign_${s}_attempted_at`] && !meta[`clicksign_${s}_done`] && !(s === "envelope" && c.provider_envelope_id) && !(s === "document" && meta.clicksign_document_id) && !(s === "signer" && meta.clicksign_signer_id));
    if (uncertain) return json({ error: "provider_recovery_required", stage: uncertain }, 409);

    const { data: p } = await admin.from("people").select("full_name,email").eq("id", c.customer_person_id).maybeSingle(); if (!p?.email) return json({ error: "customer_email_required" }, 409);
    const { data: file, error: de } = await admin.storage.from("customer-contracts").download(c.original_document_path); if (de || !file) return json({ error: "contract_pdf_download_failed" }, 500);
    const bytes = new Uint8Array(await file.arrayBuffer()); if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return json({ error: "contract_pdf_invalid" }, 422);
    let envelopeId = c.provider_envelope_id as string | null;
    const checkpoint = async (patch: Record<string, unknown>) => { Object.assign(meta, patch); const { error } = await admin.from("customer_contracts").update({ metadata: meta }).eq("id", c.id).eq("status", "draft"); if (error) throw new Error("checkpoint_failed"); };
    const attempt = async (stage: string) => checkpoint({ [`clicksign_${stage}_attempted_at`]: new Date().toISOString() });
    const done = async (stage: string, extra: Record<string, unknown> = {}) => checkpoint({ [`clicksign_${stage}_done`]: true, ...extra });

    try {
      if (!envelopeId) { await attempt("envelope"); const d = await cs("/envelopes", "POST", { data: { type: "envelopes", attributes: { name: `COBS Contrato ${c.id}`, locale: "pt-BR", auto_close: true, ...(c.expires_at ? { deadline_at: c.expires_at } : {}) } } }); envelopeId = d?.data?.id; if (!envelopeId) throw new Error("envelope_id_missing"); Object.assign(meta, { clicksign_environment: BASE.includes("sandbox") ? "sandbox" : "production", clicksign_envelope_done: true }); const { error } = await admin.from("customer_contracts").update({ provider_envelope_id: envelopeId, metadata: meta }).eq("id", c.id).eq("status", "draft"); if (error) throw new Error("db_link_envelope_failed"); }
      let documentId = meta.clicksign_document_id as string | undefined;
      if (!documentId) { await attempt("document"); const d = await cs(`/envelopes/${encodeURIComponent(envelopeId!)}/documents`, "POST", { data: { type: "documents", attributes: { filename: `contrato-${c.id}.pdf`, content_base64: `data:application/pdf;base64,${b64(bytes)}` } } }); documentId = d?.data?.id; if (!documentId) throw new Error("document_id_missing"); await done("document", { clicksign_document_id: documentId }); }
      let signerId = meta.clicksign_signer_id as string | undefined;
      if (!signerId) { await attempt("signer"); const d = await cs(`/envelopes/${encodeURIComponent(envelopeId!)}/signers`, "POST", { data: { type: "signers", attributes: { name: c.signer_name || p.full_name, email: p.email, ...(c.signer_document ? { documentation: c.signer_document } : {}), communicate_events: { signature_request: "email", signature_reminder: "email", document_signed: "email" } } } }); signerId = d?.data?.id; if (!signerId) throw new Error("signer_id_missing"); await done("signer", { clicksign_signer_id: signerId }); }
      const rel = { document: { data: { type: "documents", id: documentId } }, signer: { data: { type: "signers", id: signerId } } };
      if (!meta.clicksign_qualification_done) { await attempt("qualification"); await cs(`/envelopes/${encodeURIComponent(envelopeId!)}/requirements`, "POST", { data: { type: "requirements", attributes: { action: "agree", role: "sign" }, relationships: rel } }); await done("qualification"); }
      if (!meta.clicksign_auth_requirement_done) { await attempt("auth_requirement"); await cs(`/envelopes/${encodeURIComponent(envelopeId!)}/requirements`, "POST", { data: { type: "requirements", attributes: { action: "provide_evidence", auth: "email" }, relationships: rel } }); await done("auth_requirement"); }
      if (!meta.clicksign_activation_done) { await attempt("activation"); await cs(`/envelopes/${encodeURIComponent(envelopeId!)}`, "PATCH", { data: { id: envelopeId, type: "envelopes", attributes: { status: "running" } } }); await done("activation"); }
      if (!meta.clicksign_notification_done) { await attempt("notification"); await cs(`/envelopes/${encodeURIComponent(envelopeId!)}/notifications`, "POST", { data: { type: "notifications", attributes: {} } }); await done("notification"); }
      const sentAt = c.sent_at ?? new Date().toISOString();
      const { data: updated, error: updateError } = await admin.from("customer_contracts").update({ status: "sent", sent_at: sentAt, metadata: { ...meta, clicksign_send_error: null, clicksign_send_error_stage: null } }).eq("id", c.id).eq("status", "draft").select("id,status").maybeSingle();
      if (updateError) throw new Error("db_mark_sent_failed"); if (!updated) return json({ error: "contract_changed_during_send" }, 409);
      const { error: eventError } = await admin.from("contract_events").insert({ tenant_id: c.tenant_id, contract_id: c.id, event_type: "sent", provider_event_id: `cobs:clicksign:sent:${c.id}`, source: "cobs", payload: { provider: "clicksign", provider_envelope_id: envelopeId, provider_document_id: documentId, provider_signer_id: signerId } });
      if (eventError && eventError.code !== "23505") return json({ error: "contract_event_failed" }, 500);
      return json({ ok: true, contract_id: c.id, provider: "clicksign", provider_envelope_id: envelopeId, status: "sent" }, 202);
    } catch (e) {
      const msg = String(e); console.error("contracts-clicksign-send", msg);
      await admin.from("customer_contracts").update({ provider_envelope_id: envelopeId, metadata: { ...meta, clicksign_send_error: "provider_or_checkpoint_failure", clicksign_send_error_at: new Date().toISOString() } }).eq("id", c.id).eq("status", "draft");
      return json({ error: "clicksign_send_failed", recovery_required: true }, 502);
    }
  } catch (e) { console.error("contracts-clicksign-send", String(e)); return json({ error: "internal_error" }, 500); }
});
