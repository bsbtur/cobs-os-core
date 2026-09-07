import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260907103000_contract_live_commercial_order_gate_v1.sql",
  "utf8",
);

describe("contract live commercial order gate v1", () => {
  test("requires production classification, a live reservation and commercial commitment", () => {
    expect(migration).toContain("order_is_contractable_production");
    expect(migration).toContain("order_matches_commerce_environment");
    expect(migration).toContain("cr.status='confirmed'");
    expect(migration).toContain("cr.expires_at>now()");
    expect(migration).toContain("ff.fact_type='PAYMENT_RECORDED'");
    expect(migration).toContain("PAYMENT_REVERSED");
    expect(migration).toContain("REFUND_RECORDED");
    expect(migration).toContain(")>0");
    expect(migration).not.toContain("payment_received");
  });

  test("uses the stricter helper for contract writes and party projection", () => {
    expect(migration).toContain("guard_customer_contract_production_environment");
    expect(migration).toContain("not app_private.order_is_contractable_production");
    expect(migration).toContain("app_private.order_is_contractable_production(o.tenant_id,o.id)");
  });
});
