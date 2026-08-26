import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const MP_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
const secretKey = SUPABASE_SECRET_KEYS.default;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function mapAttemptStatus(status?: string, detail?: string) {
  if (status === "approved") return "approved";
  if (status === "processed" && detail === "accredited") return "approved";
  if (status === "processed" || status === "processing") return "processing";
  if (status === "action_required") return "pending";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "refunded") return "refunded";
  if (status === "rejected" || status === "failed") return "rejected";
  return "pending";
}
function mapChargeStatus(status: string) {
  if (status === "approved") return "paid";
  if (status === "processing") return "processing";
  if (status === "rejected") return "failed";
  if (["cancelled", "expired", "refunded"].includes(status)) return status;
  return "pending";
}
function minor(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!secretKey || !MP_ACCESS_TOKEN) return json({ error: "server_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const token = req.headers.get("x-cobs-reconcile-token");
  const { data: tokenValid, error: tokenError } = await admin.rpc("verify_payment_reconcile_token", { _candidate: token });
  if (tokenError || tokenValid !== true) return json({ error: "unauthorized" }, 401);

  let requestedLimit = 25;
  try {
    const body = await req.json();
    if (Number.isFinite(Number(body?.limit))) requestedLimit = Number(body.limit);
  } catch { /* empty body is fine */ }
  const limit = Math.max(1, Math.min(100, Math.trunc(requestedLimit)));

  const { data: attempts, error: attemptsError } = await admin
    .from("payment_attempts")
    .select("id,tenant_id,charge_id,amount_minor,provider_order_id,provider_payment_id,status,provider_status,provider_status_detail,updated_at")
    .eq("provider", "mercado_pago")
    .eq("method", "pix")
    .in("status", ["created", "pending", "processing"])
    .not("provider_order_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (attemptsError) return json({ error: "attempts_lookup_failed", details: attemptsError.message }, 500);

  const summary = { scanned: 0, updated: 0, paid: 0, unchanged: 0, amount_mismatch: 0, provider_errors: 0, db_errors: 0 };
  const errors: Array<Record<string, unknown>> = [];

  for (const attempt of attempts ?? []) {
    summary.scanned++;
    try {
      const { data: charge, error: chargeError } = await admin
        .from("payment_charges")
        .select("id,order_id,tenant_id,amount_minor,status,provider_order_id")
        .eq("id", attempt.charge_id)
        .maybeSingle();
      if (chargeError || !charge) {
        summary.db_errors++;
        errors.push({ attempt_id: attempt.id, error: "charge_lookup_failed" });
        continue;
      }
      if (!["draft", "pending", "processing"].includes(charge.status)) {
        summary.unchanged++;
        continue;
      }

      const providerResponse = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(attempt.provider_order_id)}`, {
        headers: { accept: "application/json", authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const mp = await providerResponse.json().catch(() => ({}));
      if (!providerResponse.ok) {
        summary.provider_errors++;
        errors.push({ attempt_id: attempt.id, provider_order_id: attempt.provider_order_id, status: providerResponse.status });
        continue;
      }

      const payment = mp?.transactions?.payments?.[0] ?? {};
      const providerStatus = payment?.status ?? mp?.status ?? null;
      const providerStatusDetail = payment?.status_detail ?? mp?.status_detail ?? null;
      const attemptStatus = mapAttemptStatus(providerStatus, providerStatusDetail);
      const chargeStatus = mapChargeStatus(attemptStatus);
      const providerMinor = minor(payment?.amount ?? mp?.total_amount);
      const expectedMinor = Number(attempt.amount_minor);
      const chargeMinor = Number(charge.amount_minor);

      if (providerMinor == null || providerMinor !== expectedMinor || expectedMinor !== chargeMinor) {
        summary.amount_mismatch++;
        errors.push({ attempt_id: attempt.id, provider_order_id: attempt.provider_order_id, error: "amount_mismatch", provider_minor: providerMinor, attempt_minor: expectedMinor, charge_minor: chargeMinor });
        continue;
      }

      const now = new Date().toISOString();
      const attemptPatch: Record<string, unknown> = {
        status: attemptStatus,
        provider_payment_id: payment?.id ?? attempt.provider_payment_id ?? null,
        provider_status: providerStatus,
        provider_status_detail: providerStatusDetail,
        response_snapshot: mp,
      };
      if (attemptStatus === "approved") attemptPatch.approved_at = now;
      const { error: attemptUpdateError } = await admin.from("payment_attempts").update(attemptPatch).eq("id", attempt.id);
      if (attemptUpdateError) {
        summary.db_errors++;
        errors.push({ attempt_id: attempt.id, error: "attempt_update_failed" });
        continue;
      }

      const chargePatch: Record<string, unknown> = { status: chargeStatus, provider_order_id: attempt.provider_order_id };
      if (chargeStatus === "paid") {
        chargePatch.paid_amount_minor = expectedMinor;
        chargePatch.paid_at = now;
      }
      if (chargeStatus === "cancelled") chargePatch.cancelled_at = now;
      const { error: chargeUpdateError } = await admin.from("payment_charges").update(chargePatch).eq("id", charge.id);
      if (chargeUpdateError) {
        summary.db_errors++;
        errors.push({ attempt_id: attempt.id, error: "charge_update_failed" });
        continue;
      }

      if (chargeStatus === "paid") {
        const reference = `mercado_pago:${payment?.id ?? attempt.provider_order_id}`;
        const { error: factError } = await admin.rpc("record_provider_payment", {
          _order_id: charge.order_id,
          _amount_minor: expectedMinor,
          _reference: reference,
          _reason: "Mercado Pago payment approved (automatic reconciliation)",
          _occurred_at: payment?.date_approved ?? mp?.last_updated_date ?? now,
        });
        if (factError) {
          summary.db_errors++;
          errors.push({ attempt_id: attempt.id, error: "financial_fact_failed", details: factError.message });
          continue;
        }
        summary.paid++;
      }

      const changed = attempt.status !== attemptStatus || attempt.provider_status !== providerStatus || attempt.provider_status_detail !== providerStatusDetail || charge.status !== chargeStatus;
      if (changed) summary.updated++; else summary.unchanged++;
    } catch (error) {
      summary.provider_errors++;
      errors.push({ attempt_id: attempt.id, error: "unexpected_error", details: error instanceof Error ? error.message : String(error) });
    }
  }

  return json({ ok: true, summary, errors: errors.slice(0, 20) });
});