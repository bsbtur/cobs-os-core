import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907054500_contract_document_source_gate_v1.sql",
  "utf8",
);

describe("contract document source gate v1", () => {
  test("requires a frozen source, verified SHA-256 and renderer before upload activation", () => {
    expect(migration).toContain("contract_templates_upload_document_source_guard");
    expect(migration).toContain("contract_document_source_required");
    expect(migration).toContain("contract_document_source_hash_mismatch");
    expect(migration).toContain("contract_document_renderer_required");
    expect(migration).toContain("digest(convert_to(v_source,'UTF8'),'sha256')");
  });

  test("registers only draft/review-required source without legal approval", () => {
    expect(migration).toContain("register_contract_document_source_draft");
    expect(migration).toContain("v_template.status not in ('draft','review_required')");
    expect(migration).toContain("v_template.legal_reviewed_at is not null");
    expect(migration).toContain("'formal_legal_review_recorded',false");
    expect(migration).not.toMatch(/legal_reviewed_at\s*=\s*now\(\)/i);
    expect(migration).not.toMatch(/set\s+status\s*=\s*'active'/i);
  });

  test("keeps policy, provider and payment state untouched", () => {
    expect(migration).not.toMatch(/update\s+public\.privacy_policy_versions/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.customer_contracts/i);
    expect(migration).not.toContain("contracts-clicksign-send");
    expect(migration).not.toContain("payment_charges");
  });

  test("readiness remains fail closed until source hash and renderer exist", () => {
    expect(migration).toContain("document_source_not_registered");
    expect(migration).toContain("document_source_hash_invalid");
    expect(migration).toContain("upload_renderer_not_registered");
    expect(migration).toContain("v_ready := v_source_valid and v_renderer_version is not null");
  });
});
