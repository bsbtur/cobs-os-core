import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907045000_contract_party_profile_production_gate_v2.sql",
  "utf8",
);

describe("contract party profile production gate v2", () => {
  test("rejects direct QA/test order mutation before profile writes", () => {
    const gateIndex = migration.indexOf("order_matches_commerce_environment");
    const insertIndex = migration.indexOf("insert into public.contract_party_profiles");
    expect(gateIndex).toBeGreaterThan(0);
    expect(insertIndex).toBeGreaterThan(gateIndex);
    expect(migration).toContain("'production'");
    expect(migration).toContain("production_contract_order_required");
  });

  test("preserves owner/admin and active-reservation gates", () => {
    expect(migration).toContain("array['owner','admin']::public.app_role[]");
    expect(migration).toContain("cr.status in ('reserved','confirmed')");
    expect(migration).toContain("active_reservation_required");
  });

  test("does not generate contracts or alter legal/payment/supplier state", () => {
    expect(migration).not.toContain("customer_contracts");
    expect(migration).not.toContain("clicksign");
    expect(migration).not.toMatch(/update\s+public\.contract_templates/i);
    expect(migration).not.toMatch(/update\s+public\.privacy_policy_versions/i);
    expect(migration).not.toMatch(/update\s+public\.operation_quotes/i);
  });
});
