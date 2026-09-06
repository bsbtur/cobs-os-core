import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260906024000_fix_provider_confirmation_entry_threshold_v1.sql",
  "utf8",
);

describe("provider confirmation entry threshold", () => {
  test("uses the paid public checkout entry charge before live offering visibility", () => {
    expect(migration).toContain("_c.metadata->>'source','')='public_checkout'");
    expect(migration).toContain("_c.metadata->>'commercial_payment_stage','')='entry'");
    expect(migration).toContain("coalesce(_c.installment_number,0)=1");
    expect(migration).toContain("_entry_minor := _c.amount_minor");
  });

  test("keeps the existing public offering fallback for other flows", () => {
    expect(migration).toContain("ofr.metadata->>'entry_minor'");
    expect(migration).toContain("ofr.metadata->>'sales_public'");
  });
});
