import { readFileSync } from "node:fs";

const generator = readFileSync("supabase/functions/contracts-generate/index.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261004093000_contract_generator_live_order_gate_bridge_v1.sql",
  "utf8",
);

describe("contracts-generate live production order gate", () => {
  test("checks canonical eligibility before contract evidence and insert", () => {
    const gate = generator.indexOf('rpc("is_order_contractable_production_for_service"');
    const evidence = generator.indexOf('from("contract_party_profiles")');
    const insert = generator.indexOf('.from("customer_contracts")');
    expect(gate).toBeGreaterThan(-1);
    expect(evidence).toBeGreaterThan(gate);
    expect(insert).toBeGreaterThan(evidence);
    expect(generator).toContain('error: "production_contract_order_required"');
  });

  test("bridge is service-role only and delegates to canonical private helper", () => {
    expect(migration).toContain("app_private.order_is_contractable_production(_tenant_id,_order_id)");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/to authenticated/i);
  });
});
