import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907011500_supplier_contract_legal_evidence_guard_v1.sql",
  "utf8",
);

describe("supplier contract legal evidence guard", () => {
  test("requires legal identity and commercial address before contraction", () => {
    expect(migration).toContain("supplier_legal_evidence_required");
    expect(migration).toContain("document_number");
    expect(migration).toContain("address_line1");
    expect(migration).toContain("city");
    expect(migration).toContain("state_region");
    expect(migration).toContain("postal_code");
    expect(migration).toContain("country_code");
  });

  test("requires a contract reference and preserves idempotency", () => {
    expect(migration).toContain("contract_reference_required");
    expect(migration).toContain("v_q.status='contracted'");
    expect(migration).toContain("'idempotent',true");
  });

  test("does not contract anything inside the migration itself", () => {
    expect(migration).not.toMatch(/where\s+code\s*=\s*'CIOSP-SP-2027'/i);
    expect(migration).not.toContain("insert into public.operation_quotes");
  });
});
