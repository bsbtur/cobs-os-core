import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = readFileSync("supabase/functions/contracts-generate/index.ts", "utf8");

describe("contracts-generate snapshot v2 preflight", () => {
  test("freezes commercial, supplier, privacy and program evidence", () => {
    expect(source).toContain('schema_version: "contract-snapshot-v2"');
    expect(source).toContain("commercial_terms_version");
    expect(source).toContain("payment_schedule_v1");
    expect(source).toContain("contractedSuppliers");
    expect(source).toContain("privacy_policy_versions");
    expect(source).toContain("content_hash");
    expect(source).toContain("program_version");
  });

  test("fails closed when evidence is incomplete", () => {
    expect(source).toContain('error: "contracted_suppliers_required"');
    expect(source).toContain('error: "active_privacy_policy_required"');
    expect(source).toContain('error: "commercial_terms_version_required"');
    expect(source).toContain('error: "program_version_required"');
    expect(source).toContain('error: "contract_placeholder_preflight_failed"');
    expect(source).toContain("payment_schedule_total_mismatch");
    expect(source).toContain("supplier_legal_evidence_incomplete");
  });

  test("does not call Clicksign or mark a generated draft ready to send", () => {
    expect(source).not.toContain("clicksign.com/api");
    expect(source).toContain("ready_for_provider_send: false");
    expect(source).toContain("ready_for_render: true");
  });

  test("preserves database idempotency recovery", () => {
    expect(source).toContain('createError?.code === "23505"');
    expect(source).toContain("idempotent: true");
  });
});
