import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const secretKey = SUPABASE_SECRET_KEYS.default;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!secretKey) return json({ error: "server_not_configured" }, 500);

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const internalToken = req.headers.get("x-cobs-internal-token");
  if (!internalToken) return json({ error: "missing_internal_token" }, 401);
  const { data: tokenOk, error: tokenError } = await admin.rpc("w07_validate_whatsapp_sender_token", { _token: internalToken });
  if (tokenError || tokenOk !== true) return json({ error: "invalid_internal_token" }, 401);

  const { data: cfg, error: cfgError } = await admin.rpc("w07_get_meta_whatsapp_config");
  if (cfgError) return json({ error: "config_lookup_failed", details: cfgError.message }, 500);
  const accessToken = cfg?.access_token;
  const phoneNumberId = cfg?.phone_number_id;
  const graphVersion = cfg?.graph_version;
  if (!accessToken || !phoneNumberId || !graphVersion) {
    return json({ error: "meta_whatsapp_not_configured", missing: {
      access_token: !accessToken,
      phone_number_id: !phoneNumberId,
      graph_version: !graphVersion,
    } }, 503);
  }

  let limit = 25;
  try {
    const body = await req.json();
    if (Number.isFinite(Number(body?.limit))) limit = Math.max(1, Math.min(100, Number(body.limit)));
  } catch {}

  const { data: items, error: claimError } = await admin.rpc("w07_claim_whatsapp_outbox", { _limit: limit });
  if (claimError) return json({ error: "claim_failed", details: claimError.message }, 500);

  const summary = { claimed: items?.length ?? 0, accepted: 0, retry_wait: 0, failed: 0 };
  const errors: unknown[] = [];

  for (const item of items ?? []) {
    const to = String(item.destination_snapshot ?? "").replace(/\D/g, "");
    const templateName = item.provider_template_name;
    const locale = item.template_locale;
    if (!to || !templateName || !locale) {
      const { data: fail } = await admin.rpc("w07_mark_whatsapp_send_failed", {
        _outbox_id: item.id,
        _error_code: "invalid_outbox_payload",
        _error_message: "Destination, active provider template name, or locale is missing",
        _retryable: false,
      });
      summary.failed++;
      errors.push({ outbox_id: item.id, error: "invalid_outbox_payload", result: fail });
      continue;
    }

    const requestBody: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: locale },
        ...(Array.isArray(item.payload_snapshot?.meta_components) ? { components: item.payload_snapshot.meta_components } : {}),
      },
    };

    let response: Response;
    let provider: any = {};
    try {
      response = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      });
      provider = await response.json().catch(() => ({}));
    } catch (error) {
      await admin.rpc("w07_mark_whatsapp_send_failed", {
        _outbox_id: item.id,
        _error_code: "meta_network_error",
        _error_message: String(error),
        _retryable: true,
      });
      summary.retry_wait++;
      errors.push({ outbox_id: item.id, error: "meta_network_error" });
      continue;
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const code = String(provider?.error?.code ?? `http_${response.status}`);
      const message = String(provider?.error?.message ?? "Meta WhatsApp send failed");
      const { data: fail } = await admin.rpc("w07_mark_whatsapp_send_failed", {
        _outbox_id: item.id,
        _error_code: code,
        _error_message: message,
        _retryable: retryable,
      });
      if (retryable) summary.retry_wait++; else summary.failed++;
      errors.push({ outbox_id: item.id, error: code, status: response.status, result: fail });
      continue;
    }

    const providerMessageId = provider?.messages?.[0]?.id;
    if (!providerMessageId) {
      await admin.rpc("w07_mark_whatsapp_send_failed", {
        _outbox_id: item.id,
        _error_code: "missing_provider_message_id",
        _error_message: "Meta accepted the request but no message id was returned",
        _retryable: true,
      });
      summary.retry_wait++;
      errors.push({ outbox_id: item.id, error: "missing_provider_message_id" });
      continue;
    }

    const { error: acceptError } = await admin.rpc("w07_mark_whatsapp_send_accepted", {
      _outbox_id: item.id,
      _provider_message_id: providerMessageId,
    });
    if (acceptError) {
      summary.failed++;
      errors.push({ outbox_id: item.id, error: "accept_persist_failed", details: acceptError.message });
      continue;
    }
    summary.accepted++;
  }

  return json({ ok: true, summary, errors });
});