import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20261005171000_contract_v31_program_schema_reconcile.sql",
  ),
  "utf8",
);

describe("CIOSP V3.1 program schema reconciliation", () => {
  test("keeps the template review-only and legally unreviewed", () => {
    expect(migration).toContain("status <> 'review_required'");
    expect(migration).toContain("legal_reviewed_at is not null");
    expect(migration).toContain("status = 'review_required'");
    expect(migration).toContain("legal_reviewed_at is null");
    expect(migration).not.toMatch(/status\s*=\s*'active'/i);
    expect(migration).not.toMatch(/legal_reviewed_at\s*=\s*now\(\)/i);
  });

  test("reconciles schema version and program snapshot requirements", () => {
    expect(migration).toContain("'32'::jsonb");
    expect(migration).toContain("program_snapshot");
    expect(migration).toContain("program_hash");
    expect(migration).toContain("'requires_program_snapshot', true");
    expect(migration).toContain("'program_snapshot_source', 'journey_steps'");
    expect(migration).toContain("'program_snapshot_hash', 'sha256'");
  });

  test("does not touch provider, source freeze, contracts or payments", () => {
    expect(migration).not.toContain("provider_template_id =");
    expect(migration).not.toContain("document_source_snapshot =");
    expect(migration).not.toContain("insert into public.customer_contracts");
    expect(migration).not.toContain("financial_facts");
    expect(migration).not.toContain("payment_charges");
  });
});
