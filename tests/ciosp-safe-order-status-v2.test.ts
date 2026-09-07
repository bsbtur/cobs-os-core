import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "supabase/functions/ciosp-public-order-status/index.ts",
  "utf8",
);

describe("CIOSP safe order status v2", () => {
  test("requires a checkout-session proof and never accepts email-only lookup", () => {
    expect(source).toContain('.eq("token_hash", hash)');
    expect(source).toContain("invalid_resume_proof");
    expect(source).not.toContain("payer_email");
  });

  test("scopes payment visibility to the canonical payment environment", () => {
    expect(source).toContain('metadata.qa_public_checkout === true ? "test" : MP_ENV');
    expect(source).toContain("charge?.metadata?.environment === paymentEnvironment");
    expect(source).toContain("payment_environment: paymentEnvironment");
  });

  test("is read-only and does not expose provider Pix material", () => {
    expect(source).not.toMatch(/\.insert\s*\(/);
    expect(source).not.toMatch(/\.update\s*\(/);
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toContain("response_snapshot");
    expect(source).not.toContain("pix_qr_code");
    expect(source).not.toContain("pix_ticket_url");
  });

  test("tenant-scopes both financial facts and charges", () => {
    expect(source.match(/\.eq\("tenant_id", session\.tenant_id\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
