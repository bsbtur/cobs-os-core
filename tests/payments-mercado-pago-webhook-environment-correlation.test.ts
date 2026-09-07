import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(
  "supabase/functions/payments-mercado-pago-webhook/index.ts",
  "utf8",
);

describe("Mercado Pago webhook environment correlation", () => {
  test("loads environment metadata from both attempt and charge", () => {
    expect(source).toContain('select("id,tenant_id,charge_id,amount_minor,method,metadata")');
    expect(source).toContain('select("id,order_id,tenant_id,amount_minor,currency,external_reference,metadata")');
  });

  test("fails closed when either local payment record belongs to another environment", () => {
    expect(source).toContain("const attemptEnvironmentMatches = attemptEnvironment === environment");
    expect(source).toContain("const chargeEnvironmentMatches = chargeEnvironment === environment");
    expect(source).toContain('return json({ error: "payment_environment_mismatch", environment }, 409)');
  });

  test("checks environment before financial/provider correlation updates", () => {
    const environmentGuard = source.indexOf("payment_environment_mismatch");
    const attemptUpdate = source.indexOf("update(attemptPatch)");
    const chargeUpdate = source.indexOf("update(chargePatch)");
    const recordPayment = source.indexOf('admin.rpc("record_provider_payment"');

    expect(environmentGuard).toBeGreaterThan(-1);
    expect(attemptUpdate).toBeGreaterThan(environmentGuard);
    expect(chargeUpdate).toBeGreaterThan(environmentGuard);
    expect(recordPayment).toBeGreaterThan(environmentGuard);
  });
});
