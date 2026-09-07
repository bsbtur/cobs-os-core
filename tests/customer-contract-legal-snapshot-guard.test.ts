import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907050000_customer_contract_legal_snapshot_guard_v1.sql",
  "utf8",
);

describe("customer contract legal snapshot guard", () => {
  test("requires the exact active formally reviewed template", () => {
    expect(migration).toContain("new.template_key <> 'CIOSP-2027'");
    expect(migration).toContain("ct.template_key = new.template_key");
    expect(migration).toContain("ct.version = new.template_version");
    expect(migration).toContain("ct.status = 'active'");
    expect(migration).toContain("ct.legal_reviewed_at is not null");
    expect(migration).toContain("contract_template_snapshot_mismatch");
  });

  test("requires exact active privacy evidence with legal review reference", () => {
    expect(migration).toContain("p.policy_key = v_policy_key");
    expect(migration).toContain("p.version = v_policy_version");
    expect(migration).toContain("p.content_hash = v_policy_hash");
    expect(migration).toContain("p.status = 'active'");
    expect(migration).toContain("p.legal_reviewed_at is not null");
    expect(migration).toContain("p.legal_review_reference");
    expect(migration).toContain("contract_privacy_formal_legal_review_required");
  });

  test("protects both inserts and later metadata/template changes", () => {
    expect(migration).toContain("before insert or update of tenant_id,template_key,template_version,metadata");
    expect(migration).toContain("customer_contracts_legal_snapshot_guard");
  });

  test("does not create approval, contracts, provider calls or financial mutations", () => {
    expect(migration).not.toMatch(/update\s+public\.contract_templates/i);
    expect(migration).not.toMatch(/update\s+public\.privacy_policy_versions/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.customer_contracts/i);
    expect(migration.toLowerCase()).not.toContain("clicksign");
    expect(migration.toLowerCase()).not.toContain("payment_charges");
  });
});
