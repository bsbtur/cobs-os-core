import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/20260907150000_customer_contract_document_artifact_immutability_v1.sql",
  "utf8",
).replace(/\s+/g, " ");

describe("customer contract document artifact immutability v1", () => {
  test("guards only the CIOSP-2027 frozen artifact", () => {
    expect(sql).toContain("if old.template_key <> 'CIOSP-2027' then return new;");
  });

  test("allows first renderer write but blocks later path/hash replacement or removal", () => {
    expect(sql).toContain("old.original_document_path is not null");
    expect(sql).toContain("old.original_document_path is distinct from new.original_document_path");
    expect(sql).toContain("old.document_hash is not null");
    expect(sql).toContain("old.document_hash is distinct from new.document_hash");
    expect(sql).toContain("contract_document_artifact_immutable");
  });

  test("runs only when frozen artifact columns are updated", () => {
    expect(sql).toContain("before update of original_document_path, document_hash on public.customer_contracts");
  });
});
