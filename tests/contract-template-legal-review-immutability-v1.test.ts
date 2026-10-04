import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261004140000_contract_template_legal_review_immutability_v1.sql",
  "utf8",
);

describe("contract template legal review immutability", () => {
  test("freezes legal review identity after review or activation", () => {
    expect(migration).toContain("reviewed_contract_legal_evidence_immutable");
    expect(migration).toContain("new.legal_reviewed_at is distinct from old.legal_reviewed_at");
    expect(migration).toContain("new.legal_reviewed_by is distinct from old.legal_reviewed_by");
    expect(migration).toContain("legal_reviewed_by,status");
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  test("preserves document source immutability", () => {
    expect(migration).toContain("reviewed_contract_document_source_immutable");
    expect(migration).toContain("active_contract_document_source_immutable");
  });
});
