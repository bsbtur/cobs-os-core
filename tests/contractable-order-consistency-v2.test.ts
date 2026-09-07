import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260907104500_contractable_order_consistency_v2.sql",
  "utf8",
);

describe("contractable order consistency v2", () => {
  test("contract-party writes use canonical production contract eligibility", () => {
    expect(migration).toContain("order_is_contractable_production");
    expect(migration).toContain("production_contract_order_required");
    expect(migration).not.toContain("order_matches_commerce_environment(");
  });

  test("does not relax authorization or required legal fields", () => {
    expect(migration).toContain("array['owner','admin']");
    expect(migration).toContain("contract_party_profile_fields_required");
    expect(migration).toContain("contract_party_document_type_invalid");
  });
});
