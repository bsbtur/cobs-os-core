import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const pix = readFileSync(
  "supabase/functions/ciosp-public-create-pix/index.ts",
  "utf8",
);

const webhook = readFileSync(
  "supabase/functions/payments-mercado-pago-webhook/index.ts",
  "utf8",
);

describe("CIOSP Pix webhook authority", () => {
  test("Pix function never records the financial fact synchronously", () => {
    expect(pix).not.toMatch(/\.rpc\(\s*["']record_provider_payment["']/);
    expect(pix).not.toMatch(/status\s*:\s*["']paid["']/);
    expect(pix).not.toMatch(/paid_amount_minor\s*:\s*amount/);
    expect(pix).not.toMatch(
      /public_checkout_sessions[\s\S]*?update\(\s*\{\s*status\s*:\s*["']consumed["']/,
    );
  });

  test("provider approval stays processing until the webhook is correlated", () => {
    expect(pix).toMatch(
      /const\s+cs\s*=\s*as\s*===\s*["']approved["']\s*\|\|\s*as\s*===\s*["']processing["']\s*\?\s*["']processing["']\s*:\s*["']pending["']/,
    );
    expect(pix).toMatch(/confirmed\s*:\s*false/);
    expect(pix).toMatch(
      /awaiting_webhook\s*:\s*as\s*===\s*["']approved["']/,
    );
  });

  test("signed/correlated webhook owns payment recording", () => {
    expect(webhook).toMatch(
      /admin\.rpc\(\s*["']record_provider_payment["']/,
    );
    expect(webhook).toContain("provider_correlation_mismatch");
    expect(webhook).toContain("signature_valid");
  });
});
