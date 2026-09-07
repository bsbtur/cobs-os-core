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

  test("generator already fails closed when the configured policy key is not active", () => {
    expect(generator).toContain("templateMetadata.privacy_policy_key");
    expect(generator).toContain('row.policy_key === configuredPrivacyKey');
    expect(generator).toContain('configured_privacy_policy_not_active');
  });
});
