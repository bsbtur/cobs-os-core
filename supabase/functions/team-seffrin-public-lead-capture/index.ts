import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = SUPABASE_SECRET_KEYS.default;
const N8N_COMMERCIAL_WEBHOOK_URL = Deno.env.get("N8N_COMMERCIAL_WEBHOOK_URL") ?? "";
const N8N_WEBHOOK_TOKEN = Deno.env.get("N8N_WEBHOOK_TOKEN") ?? "";
const OPERATION_CODE = "TEAM-SEFFRIN-BSB-20270416";

const cors = { ...corsHeaders, "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function normalizePhone(value?: string) {
  if (!value) return null;
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return null;
}

function clean(value: unknown, max = 600) {
  return String(value ?? "").trim().slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !secretKey) return json({ error: "server_not_configured" }, 500);

  let body: {
    full_name?: string; email?: string; phone?: string; city?: string;
    profile?: string; distance?: string; quantity?: string; accommodation_preference?: string; notes?: string;
    consent_contact?: boolean; idempotency_key?: string; source?: string; campaign?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const fullName = clean(body.full_name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const phone = normalizePhone(body.phone);
  const city = clean(body.city, 120);
  const profile = clean(body.profile, 40);
  const distance = clean(body.distance, 40) || "A definir";
  const quantity = clean(body.quantity, 10) || "1";
  const accommodationPreference = clean(body.accommodation_preference, 80) || "Ainda não defini";
  const notes = clean(body.notes, 600);
  const consentContact = body.consent_contact === true;
  const idempotencyKey = clean(body.idempotency_key, 120);
  const source = clean(body.source || "team-seffrin-brasilia-2027", 80);
  const campaign = clean(body.campaign || "team-seffrin-brasilia-2027-fundadores-1", 120);

  if (fullName.length < 2) return json({ error: "invalid_full_name" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);
  if (!phone) return json({ error: "invalid_phone" }, 400);
  if (!consentContact) return json({ error: "contact_consent_required" }, 400);
  if (idempotencyKey.length < 16) return json({ error: "invalid_idempotency_key" }, 400);
  if (!["Atleta","Acompanhante"].includes(profile)) return json({ error: "invalid_profile" }, 400);
  if (!["A definir","5K","10K","21K","42K"].includes(distance)) return json({ error: "invalid_distance" }, 400);
  if (!["1","2","3","4","5+"].includes(quantity)) return json({ error: "invalid_quantity" }, 400);
  if (!["Ainda não defini","Casal","Quarto duplo compartilhado","Acompanhante / família"].includes(accommodationPreference)) return json({ error: "invalid_accommodation_preference" }, 400);

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const { data: op, error: opError } = await admin
    .from("operations")
    .select("id,tenant_id,experience_id,code,archived_at")
    .eq("code", OPERATION_CODE)
    .is("archived_at", null)
    .maybeSingle();
  if (opError) return json({ error: "operation_lookup_failed" }, 500);
  if (!op?.tenant_id) return json({ error: "lead_capture_not_configured" }, 409);

  const { data: stay } = await admin
    .from("hospitality_stays")
    .select("id,status,hospitality_properties!inner(name)")
    .eq("operation_id", op.id)
    .eq("tenant_id", op.tenant_id)
    .eq("hospitality_properties.name", "Woodstock Guesthouse")
    .neq("status", "cancelled")
    .maybeSingle();

  let capacityStatus = "unconfigured";
  let waitlist = false;
  let remainingCapacity: number | null = null;

  if (stay?.id) {
    const [rooms, guests] = await Promise.all([
      admin
        .from("hospitality_rooms")
        .select("capacity,room_status")
        .eq("stay_id", stay.id)
        .eq("tenant_id", op.tenant_id),
      admin
        .from("hospitality_stay_participations")
        .select("id", { count: "exact", head: true })
        .eq("stay_id", stay.id)
        .eq("tenant_id", op.tenant_id)
        .eq("is_active", true),
    ]);

    if (!rooms.error && !guests.error) {
      const capacity = (rooms.data ?? [])
        .filter((room) => room.room_status !== "blocked")
        .reduce((sum, room) => sum + Number(room.capacity || 0), 0);
      const occupied = guests.count ?? 0;
      remainingCapacity = Math.max(0, capacity - occupied);
      waitlist = capacity > 0 && occupied >= capacity;
      capacityStatus = capacity > 0 ? (waitlist ? "sold_out" : "available") : "unconfigured";
    }
  }

  const metadata = {
    event_type: "lead.created",
    landing: "maratona-brasilia-2027.vercel.app",
    product: "team_seffrin_brasilia_2027",
    lot: "fundadores-1",
    traveler_profile: profile,
    intended_distance: distance,
    party_size: quantity,
    accommodation_preference: accommodationPreference,
    capacity_status: capacityStatus,
    waitlist,
    remaining_capacity_at_capture: remainingCapacity,
    city: city || null,
    notes: notes || null,
    prelaunch: true,
    creates_order: false,
    creates_payment: false,
    creates_participation: false,
  };

  const { data: inserted, error: insertError } = await admin
    .from("commercial_leads")
    .insert({
      tenant_id: op.tenant_id,
      experience_id: op.experience_id,
      operation_id: op.id,
      full_name: fullName,
      email,
      phone,
      source,
      campaign,
      status: "new",
      consent_contact: true,
      consent_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      metadata,
    })
    .select("id,status,created_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing } = await admin
        .from("commercial_leads")
        .select("id,status,created_at")
        .eq("tenant_id", op.tenant_id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) return json({ ...existing, duplicate: true }, 200);
    }
    console.error("team_seffrin_lead_insert_failed", insertError);
    return json({ error: "lead_capture_failed" }, 500);
  }

  const correlationId = crypto.randomUUID();
  const eventRow = {
    tenant_id: op.tenant_id,
    operation_id: op.id,
    actor_profile_id: null,
    event_type: "lead.created",
    source: "team_seffrin_public",
    idempotency_key: `lead:${inserted.id}`,
    correlation_id: correlationId,
    payload: {
      lead_id: inserted.id, name: fullName, email, phone, city: city || null,
      profile, distance, quantity, accommodation_preference: accommodationPreference,
      capacity_status: capacityStatus, waitlist,
      message: waitlist
        ? "Tenho interesse na lista de espera da Team Seffrin Experience — Brasília 2027."
        : "Tenho interesse na Team Seffrin Experience — Brasília 2027.",
      source, campaign, is_test: false,
    },
  };

  const { data: automationEvent, error: eventError } = await admin
    .from("automation_events")
    .insert(eventRow)
    .select("id,tenant_id,operation_id,event_type,idempotency_key,correlation_id,payload,created_at")
    .single();

  if (eventError) {
    console.error("team_seffrin_automation_event_insert_failed", eventError);
    return json({ ...inserted, duplicate: false, automation: { status: "failed", error: "event_insert_failed" } }, 201);
  }

  if (!N8N_COMMERCIAL_WEBHOOK_URL || !N8N_WEBHOOK_TOKEN) {
    await admin.from("automation_events").update({
      dispatch_status: "failed", dispatch_attempts: 1,
      last_error_code: "n8n_not_configured",
      last_error_message: "Commercial automation webhook is not configured",
    }).eq("id", automationEvent.id);
    return json({ ...inserted, duplicate: false, automation: { status: "failed", event_id: automationEvent.id } }, 201);
  }

  try {
    const webhook = new URL(N8N_COMMERCIAL_WEBHOOK_URL.trim());
    if (webhook.protocol !== "https:") throw new Error("Commercial webhook must use https");
    const response = await fetch(webhook.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-cobs-webhook-token": N8N_WEBHOOK_TOKEN },
      body: JSON.stringify({ schema_version: 1, ...automationEvent }),
    });

    if (!response.ok) {
      await admin.from("automation_events").update({
        dispatch_status: "failed", dispatch_attempts: 1,
        last_error_code: `n8n_http_${response.status}`,
        last_error_message: "Automation orchestrator rejected dispatch",
      }).eq("id", automationEvent.id);
      return json({ ...inserted, duplicate: false, automation: { status: "failed", event_id: automationEvent.id } }, 201);
    }

    await admin.from("automation_events").update({
      dispatch_status: "dispatched", dispatch_attempts: 1, dispatched_at: new Date().toISOString(),
      last_error_code: null, last_error_message: null,
    }).eq("id", automationEvent.id);

    await admin.from("audit_events").insert({
      tenant_id: op.tenant_id,
      actor_profile_id: null,
      action: "automation.dispatch",
      subject_type: "automation_event",
      subject_id: automationEvent.id,
      correlation_id: correlationId,
      metadata: { event_type: "lead.created", orchestrator: "n8n", source: "team_seffrin_public" },
    });

    return json({ ...inserted, duplicate: false, automation: { status: "dispatched", event_id: automationEvent.id } }, 201);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown network error";
    await admin.from("automation_events").update({
      dispatch_status: "failed", dispatch_attempts: 1,
      last_error_code: "n8n_network_error", last_error_message: detail.slice(0,500),
    }).eq("id", automationEvent.id);
    return json({ ...inserted, duplicate: false, automation: { status: "failed", event_id: automationEvent.id } }, 201);
  }
});
