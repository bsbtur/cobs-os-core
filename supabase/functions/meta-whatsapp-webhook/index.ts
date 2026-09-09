import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERIFY_TOKEN = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") ?? "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const N8N_WHATSAPP_WEBHOOK_URL = Deno.env.get("N8N_WHATSAPP_WEBHOOK_URL") ?? "";
const N8N_WHATSAPP_TOKEN = Deno.env.get("COBS_N8N_WHATSAPP_TOKEN") ?? "";

const text = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

function constantTimeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyMetaSignature(rawBody: string, signatureHeader: string) {
  if (!META_APP_SECRET || !signatureHeader.startsWith("sha256=")) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = `sha256=${bytesToHex(new Uint8Array(digest))}`;
  return constantTimeEqual(expected, signatureHeader.toLowerCase());
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode") ?? "";
    const suppliedToken = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";

    if (mode !== "subscribe" || !challenge) return text("bad_request", 400);
    if (!VERIFY_TOKEN) return text("server_not_configured", 503);
    if (!constantTimeEqual(suppliedToken, VERIFY_TOKEN)) return text("forbidden", 403);

    return text(challenge, 200);
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!META_APP_SECRET || !N8N_WHATSAPP_WEBHOOK_URL || !N8N_WHATSAPP_TOKEN) {
    return json({ error: "server_not_configured" }, 503);
  }

  const rawBody = await req.text();
  if (rawBody.length > 262_144) return json({ error: "body_too_large" }, 413);

  const signatureHeader = req.headers.get("x-hub-signature-256") ?? "";
  const signatureValid = await verifyMetaSignature(rawBody, signatureHeader);
  if (!signatureValid) return json({ error: "invalid_signature" }, 401);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>).object !== "whatsapp_business_account"
  ) {
    return json({ error: "unsupported_event" }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(N8N_WHATSAPP_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cobs-source": "meta-whatsapp",
        "x-cobs-meta-signature-verified": "true",
        "x-cobs-webhook-token": N8N_WHATSAPP_TOKEN,
      },
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return json({ error: "upstream_unreachable" }, 502);
  }

  if (!upstream.ok) {
    return json({ error: "upstream_rejected", status: upstream.status }, 502);
  }

  return json({ ok: true }, 200);
});
