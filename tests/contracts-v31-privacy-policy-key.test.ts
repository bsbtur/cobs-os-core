import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260907030000_contract_v31_pin_privacy_policy_key.sql",
  "utf8",
);
const generator = readFileSync("supabase/functions/contracts-generate/index.ts", "utf8");

describe("CIOSP-2027/V3.1 privacy policy identity", () => {
  test("pins the contract template to an explicit traveler-contract policy key", () => {
    expect(migration).toContain("'privacy_policy_key','ciosp-2027-traveler-contract'");
    expect(migration).toContain("'privacy_policy_scope','traveler_contract'");
    expect(migration).toContain("formal_legal_validation_required");
  });

  test("changes only a review-only, legally unreviewed V3.1 template", () => {
    expect(migration).toContain("status <> 'review_required'");
    expect(migration).toContain("legal_reviewed_at is not null");
    expect(migration).toContain("status='review_required'");
    expect(migration).toContain("legal_reviewed_at is null");
    expect(migration).not.toContain("legal_reviewed_at=now()");
    expect(migration).not.toContain("status='active'");
  });

  test("does not create or activate a privacy policy", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.privacy_policy_versions/i);
    expect(migration).not.toMatch(/update\s+public\.privacy_policy_versions/i);
  });

  test("generator queries only the configured active policy key", () => {
    const compact = generator.replace(/\s+/g, " ");
    expect(generator).toContain("templateMetadata.privacy_policy_key");
    expect(generator).toContain('configured_privacy_policy_required');
    expect(compact).toContain('.from("privacy_policy_versions")');
    expect(compact).toContain('.eq("policy_key", configuredPrivacyKey)');
    expect(compact).toContain('.eq("status", "active")');
    expect(compact).toContain('.limit(1) .maybeSingle()');
    expect(generator).toContain('configured_privacy_policy_not_active');
    expect(generator).not.toContain('privacy_policy_ambiguous');
    expect(generator).not.toContain('row.policy_key === configuredPrivacyKey');
    expect(generator).not.toContain('.limit(2)');
  });
});
