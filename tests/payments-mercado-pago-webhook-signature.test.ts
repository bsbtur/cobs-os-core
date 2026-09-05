import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const encoder = new TextEncoder();
const webhookSource = readFileSync(
  "supabase/functions/payments-mercado-pago-webhook/index.ts",
  "utf8",
);

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function computeHmac(manifest: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(manifest)));
}

async function validateSignature(input: {
  dataId: string;
  requestId: string;
  timestamp: string;
  signature: string;
  secret: string;
}) {
  const variants = [
    ...new Set([
      input.dataId,
      /[a-zA-Z]/.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId,
    ]),
  ];

  for (const dataId of variants) {
    const manifest = `id:${dataId};request-id:${input.requestId};ts:${input.timestamp};`;
    const calculated = await computeHmac(manifest, input.secret);
    if (constantTimeEqual(calculated, input.signature.toLowerCase())) return true;
  }

  return false;
}

describe("Mercado Pago webhook signature", () => {
  test("rejects an invalid signed simulation before requiring provider credentials", () => {
    const invalidSignatureRejection = webhookSource.indexOf("simulation_requires_signature");
    const providerCredentialGuard = webhookSource.indexOf("if (!accessToken)");

    expect(invalidSignatureRejection).toBeGreaterThan(-1);
    expect(providerCredentialGuard).toBeGreaterThan(invalidSignatureRejection);
    expect(webhookSource).toContain('return json({ error: "simulation_requires_signature" }, 401)');
  });

  test("accepts an uppercase ORDTST id when Mercado Pago signs the lowercase manifest", async () => {
    const dataId = "ORDTST01M1CNG2CVKPANVK5D0QGW1MGC";
    const requestId = "request-qa-001";
    const timestamp = "1788205335";
    const secret = "webhook-test-secret";
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
    const signature = await computeHmac(manifest, secret);

    expect(
      await validateSignature({
        dataId,
        requestId,
        timestamp,
        signature,
        secret,
      }),
    ).toBe(true);
  });

  test("continues accepting numeric ids without changing their representation", async () => {
    const dataId = "123456";
    const requestId = "request-qa-002";
    const timestamp = "1788205336";
    const secret = "webhook-test-secret";
    const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
    const signature = await computeHmac(manifest, secret);

    expect(
      await validateSignature({
        dataId,
        requestId,
        timestamp,
        signature,
        secret,
      }),
    ).toBe(true);
  });

  test("rejects the same signature when x-request-id differs", async () => {
    const dataId = "ORDTST01M1CNG2CVKPANVK5D0QGW1MGC";
    const requestId = "request-qa-003";
    const timestamp = "1788205337";
    const secret = "webhook-test-secret";
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
    const signature = await computeHmac(manifest, secret);

    expect(
      await validateSignature({
        dataId,
        requestId: "request-qa-other",
        timestamp,
        signature,
        secret,
      }),
    ).toBe(false);
  });
});
