import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const pix = readFileSync(
  "supabase/functions/ciosp-public-create-pix/index.ts",
  "utf8",
);
const card = readFileSync(
  "supabase/functions/ciosp-public-pay-card/index.ts",
  "utf8",
);
const reconcile = readFileSync(
  "supabase/functions/payments-reconcile-pending/index.ts",
  "utf8",
);

describe("CIOSP webhook settlement authority", () => {
  test("Pix marks commercial charges and attempts as webhook-authoritative", () => {
    expect(pix).toMatch(/settlement_authority\s*:\s*["']webhook["']/);
  });

  test("card marks commercial charges and attempts as webhook-authoritative", () => {
    expect(card).toMatch(/settlement_authority\s*:\s*["']webhook["']/);
  });

  test("reconciliation never settles webhook-authoritative approvals", () => {
    expect(reconcile).toContain('settlement_authority === "webhook"');
    expect(reconcile).toContain('effectiveChargeStatus');
    expect(reconcile).toContain('deferred_to_webhook');
    expect(reconcile).toMatch(
      /chargeStatus\s*===\s*["']paid["']\s*&&\s*!webhookAuthoritative/,
    );
    expect(reconcile).toMatch(
      /chargeStatus\s*===\s*["']paid["']\s*&&\s*webhookAuthoritative/,
    );
  });
});
