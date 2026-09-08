import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = SUPABASE_SECRET_KEYS.default;
const N8N_COMMERCIAL_WEBHOOK_URL = Deno.env.get("N8N_COMMERCIAL_WEBHOOK_URL") ?? "";
const N8N_WEBHOOK_TOKEN = Deno.env.get("N8N_WEBHOOK_TOKEN") ?? "";
const OPERATION_CODE = "CALDAS-EXPERIENCE-20270617";
const SOURCE = "caldas_novas_experience";
const CAMPAIGN = "caldas-novas-experience-pre-venda-20270617";

const cors = { ...corsHeaders, "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function normalizePhone(value?: string) {
  if (!value) return null;
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !secretKey) return json({ error: "server_not_configured" }, 500);

  let body: { full_name?: string; email?: string; phone?: string; consent_contact?: boolean; idempotency_key?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const fullName = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  const consentContact = body.consent_contact === true;
  const idempotencyKey = (body.idempotency_key ?? "").trim();

  if (fullName.length < 2 || fullName.length > 120) return json({ error: "invalid_full_name" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "invalid_email" }, 400);
  if (!phone) return json({ error: "invalid_phone" }, 400);
  if (!consentContact) return json({ error: "contact_consent_required" }, 400);
  if (idempotencyKey.length < 16 || idempotencyKey.length > 120) return json({ error: "invalid_idempotency_key" }, 400);

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const { data: op, error: opError } = await admin.from("operations").select("id,tenant_id,experience_id,code,archived_at").eq("code", OPERATION_CODE).is("archived_at", null).maybeSingle();
  if (opError) return json({ error: "operation_lookup_failed" }, 500);
  if (!op?.tenant_id) return json({ error: "lead_capture_not_configured" }, 409);

  const { data: inserted, error: insertError } = await admin.from("commercial_leads").insert({
    tenant_id: op.tenant_id, experience_id: op.experience_id, operation_id: op.id,
    full_name: fullName, email, phone, source: SOURCE, campaign: CAMPAIGN, status: "new",
    consent_contact: true, consent_at: new Date().toISOString(), idempotency_key: idempotencyKey,
    metadata: { event_type: "lead.created", landing: "/caldas-novas-experience", product: "aguas_termais_2027", sales_mode: "pre_sale_interest", creates_order: false, creates_payment: false },
  }).select("id,status,created_at").single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing } = await admin.from("commercial_leads").select("id,status,created_at").eq("tenant_id", op.tenant_id).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existing) return json({ ...existing, duplicate: true }, 200);
    }
    console.error("caldas_commercial_lead_insert_failed", insertError);
    return json({ error: "lead_capture_failed" }, 500);
  }

  const correlationId = crypto.randomUUID();
  const { data: automationEvent, error: eventError } = await admin.from("automation_events").insert({
    tenant_id: op.tenant_id, operation_id: op.id, actor_profile_id: null,
    event_type: "lead.created", source: "caldas_public", idempotency_key: `lead:${inserted.id}`, correlation_id: correlationId,
    payload: { lead_id: inserted.id, name: fullName, email, phone, message: "Tenho interesse na pré-venda da Caldas Novas Experience — Águas Termais 2027.", source: SOURCE, campaign: CAMPAIGN, product: "aguas_termais_2027", is_test: false },
  }).select("id,tenant_id,operation_id,event_type,idempotency_key,correlation_id,payload,created_at").single();

  if (eventError) return json({ ...inserted, duplicate: false, automation: { status: "failed", error: "event_insert_failed" } }, 201);
  if (!N8N_COMMERCIAL_WEBHOOK_URL || !N8N_WEBHOOK_TOKEN) {
    await admin.from("automation_events").update({ dispatch_status: "failed", dispatch_attempts: 1, last_error_code: "n8n_not_configured", last_error_message: "Commercial automation webhook is not configured" }).eq("id", automationEvent.id);
    return json({ ...inserted, duplicate: false, automation: { status: "failed", event_id: automationEvent.id } }, 201);
  }

  try {
    const webhook = new URL(N8N_COMMERCIAL_WEBHOOK_URL.trim());
    if (webhook.protocol !== "https:") throw new Error("Commercial webhook must use https");
    const response = await fetch(webhook.toString(), { method: "POST", headers: { "content-type": "application/json", "x-cobs-webhook-token": N8N_WEBHOOK_TOKEN }, body: JSON.stringify({ schema_version: 1, ...automationEvent }) });
    if (!response.ok) {
      await admin.from("automation_events").update({ dispatch_status: "failed", dispatch_attempts: 1, last_error_code: `n8n_http_${response.status}`, last_error_message: "Automation orchestrator rejected dispatch" }).eq("id", automationEvent.id);
      return json({ ...inserted, duplicate: false, automation: { status: "failed", event_id: automationEvent.id } }, 201);
    }
    await admin.from("automation_events").update({ dispatch_status: "dispatched", dispatch_attempts: 1, dispatched_at: new Date().toISOString(), last_error_code: null, last_error_message: null }).eq("id", automationEvent.id);
    await admin.from("audit_events").insert({ tenant_id: op.tenant_id, actor_profile_id: null, action: "automation.dispatch", subject_type: "automation_event", subject_id: automationEvent.id, correlation_id: correlationId, metadata: { event_type: "lead.created", orchestrator: "n8n", source: "caldas_public" } });
    return json({ ...inserted, duplicate: false, automation: { status: "dispatched", event_id: automationEvent.id } }, 201);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown network error";
    await admin.from("automation_events").update({ dispatch_status: "failed", dispatch_attempts: 1, last_error_code: "n8n_network_error", last_error_message: detail.slice(0, 500) }).eq("id", automationEvent.id);
    return json({ ...inserted, duplicate: false, automation: { status: "failed", event_id: automationEvent.id } }, 201);
  }
});
