import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907015000_contract_v31_require_program_snapshot.sql",
  "utf8",
);

describe("CIOSP-2027/V3.1 program snapshot schema", () => {
  test("requires program snapshot and hash", () => {
    expect(migration).toContain('"program_snapshot"');
    expect(migration).toContain('"program_hash"');
    expect(migration).toContain("requires_program_snapshot");
    expect(migration).toContain("program_snapshot_source");
    expect(migration).toContain("program_snapshot_hash");
  });

  test("fails closed if V3.1 has already been legally reviewed or activated", () => {
    expect(migration).toContain("status <> 'review_required'");
    expect(migration).toContain("legal_reviewed_at IS NOT NULL");
    expect(migration).toContain("RAISE EXCEPTION");
  });

  test("does not activate or legally approve the template", () => {
    expect(migration).toContain("status = 'review_required'");
    expect(migration).toContain("legal_reviewed_at IS NULL");
    expect(migration).not.toContain("legal_reviewed_at = now()");
    expect(migration).not.toContain("status = 'active'");
  });
});
