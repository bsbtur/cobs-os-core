import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUB = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default;
const SEC = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
const TOKEN = (Deno.env.get("CLICKSIGN_ACCESS_TOKEN") ?? "").trim();
const BASE = (Deno.env.get("CLICKSIGN_BASE_URL") ?? "https://sandbox.clicksign.com/api/v3").replace(/\/$/, "");
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });

function collect(value: unknown, key: string, out: unknown[] = []): unknown[] {
  if (!value || typeof value !== "object") return out;
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, key)) out.push(record[key]);
  for (const child of Object.values(record)) collect(child, key, out);
  return out;
}

async function clicksignEnvelope(envelopeId: string) {
  const response = await fetch(`${BASE}/envelopes/${encodeURIComponent(envelopeId)}`, {
    headers: { authorization: TOKEN, accept: "application/vnd.api+json" },
  });
  const text = await response.text();
  let data: unknown = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 800) }; }
  if (!response.ok) throw new Error(`clicksign_${response.status}`);
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!PUB || !SEC) return json({ error: "supabase_keys_not_available" }, 500);
    const auth = req.headers.get("authorization");
    if (!auth) return json({ error: "authorization_required" }, 401);

    const userClient = createClient(SUPABASE_URL, PUB, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "invalid_session" }, 401);

    let input: { contract_id?: string };
    try { input = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const contractId = input.contract_id?.trim();
    if (!contractId) return json({ error: "contract_id_required" }, 400);

    const admin = createClient(SUPABASE_URL, SEC, { auth: { persistSession: false } });
    const { data: contract, error: contractError } = await admin.from("customer_contracts")
      .select("id,tenant_id,status,provider,provider_envelope_id,metadata,signed_at")
      .eq("id", contractId).eq("provider", "clicksign").maybeSingle();
    if (contractError) return json({ error: "contract_lookup_failed" }, 500);
    if (!contract) return json({ error: "contract_not_found" }, 404);

    const { data: membership } = await admin.from("memberships").select("role")
      .eq("tenant_id", contract.tenant_id).eq("profile_id", userData.user.id).eq("status", "active").maybeSingle();
    if (!membership || !["owner", "admin", "operations_agent"].includes(membership.role)) return json({ error: "forbidden" }, 403);

    if (contract.status === "signed") return json({ ok: true, idempotent: true, contract_id: contract.id, status: "signed" }, 200);
    if (["cancelled", "expired", "superseded"].includes(contract.status)) return json({ error: "terminal_contract_state", status: contract.status }, 409);
    if (!contract.provider_envelope_id) return json({ error: "provider_envelope_missing" }, 409);
    if (!TOKEN) return json({ error: "clicksign_not_configured" }, 503);

    const envelope = await clicksignEnvelope(contract.provider_envelope_id);
    const statuses = collect(envelope, "status").map(String);
    const signedHints = [...collect(envelope, "signed_at"), ...collect(envelope, "signedAt"), ...collect(envelope, "signed")];
    const raw = JSON.stringify(envelope).toLowerCase();
    const signed = statuses.some((status) => ["closed", "completed", "signed"].includes(status.toLowerCase())) || signedHints.some(Boolean) || (raw.includes("\"action\":\"sign\"") && raw.includes("\"status\":\"fulfilled\""));

    if (!signed) return json({ ok: true, contract_id: contract.id, previous_status: contract.status, reconciled_status: contract.status, provider_envelope_statuses: statuses, signed_evidence: false }, 200);

    const now = new Date().toISOString();
    const metadata = { ...(contract.metadata ?? {}), reconciled_from_clicksign_at: now, reconciled_envelope_statuses: statuses };
    const { data: updated, error: updateError } = await admin.from("customer_contracts")
      .update({ status: "signed", signed_at: contract.signed_at ?? now, metadata })
      .eq("id", contract.id).eq("status", contract.status)
      .select("id,status,signed_at").maybeSingle();
    if (updateError) return json({ error: "contract_update_failed" }, 500);
    if (!updated) return json({ error: "contract_changed_during_reconciliation" }, 409);

    const providerEventId = `cobs:clicksign:reconciled-signed:${contract.id}:${contract.provider_envelope_id}`;
    const { error: eventError } = await admin.from("contract_events").insert({ tenant_id: contract.tenant_id, contract_id: contract.id, event_type: "signed", provider_event_id: providerEventId, source: "system", payload: { provider: "clicksign", method: "reconciliation", provider_envelope_id: contract.provider_envelope_id, envelope_statuses: statuses } });
    if (eventError && eventError.code !== "23505") return json({ error: "contract_event_failed" }, 500);

    return json({ ok: true, contract_id: contract.id, previous_status: contract.status, reconciled_status: "signed", provider_envelope_statuses: statuses, signed_evidence: true }, 200);
  } catch (error) {
    console.error("contracts-clicksign-reconcile", String(error));
    return json({ error: "reconcile_failed" }, 502);
  }
});
