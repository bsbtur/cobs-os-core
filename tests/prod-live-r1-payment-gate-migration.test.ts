import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260917100000_prod_live_r1_payment_gate_fixture_v1.sql",
  "utf8",
);

describe("PROD LIVE R$1 database gate", () => {
  it("hard-pins amount/provider/environment", () => {
    expect(migration).toContain("amount_minor = 100");
    expect(migration).toContain("currency = 'BRL'");
    expect(migration).toContain("provider = 'mercado_pago'");
    expect(migration).toContain("method = 'pix'");
    expect(migration).toContain("environment = 'production'");
  });

  it("starts locked and supports one-shot lifecycle", () => {
    expect(migration).toContain("'prod-live-r1-payment-gate-v1'");
    expect(migration).toContain("'locked','authorized','consumed','retired'");
    expect(migration).toContain("'locked'");
  });

  it("is inaccessible to public browser roles", () => {
    expect(migration).toContain("revoke all on table app_private.prod_live_payment_gates from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update on table app_private.prod_live_payment_gates to service_role");
  });

  it("does not create a payment artifact", () => {
    expect(migration).not.toContain("insert into public.payment_charges");
    expect(migration).not.toContain("insert into public.payment_attempts");
    expect(migration).not.toContain("insert into public.financial_facts");
  });
});
