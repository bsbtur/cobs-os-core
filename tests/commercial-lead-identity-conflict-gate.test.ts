import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const converter = readFileSync("supabase/migrations/20261016233000_commercial_lead_identity_conflict_gate_v1.sql", "utf8");
const resolver = readFileSync("supabase/migrations/20261016233100_canonical_commercial_identity_resolver.sql", "utf8");

describe("Canonical commercial lead identity resolver", () => {
  test("delegates conversion to a private tenant-authorized resolver", () => {
    expect(converter).toContain("app_private.resolve_commercial_lead_person(");
    expect(converter).toContain("app_private.w09_require_commerce_manager(_lead.tenant_id)");
    expect(resolver).toContain("app_private.w09_require_commerce_manager(_tenant_id)");
    expect(resolver).toContain("l.tenant_id = _tenant_id");
  });
  test("serializes per tenant and email; telephone is never an identity key", () => {
    expect(resolver).toContain("pg_advisory_xact_lock(");
    expect(resolver).toContain("':email:' || _normalized_email");
    expect(resolver).toContain("lower(btrim(p.email)) = _normalized_email");
    expect(resolver).toContain("p.phone_e164 = _normalized_phone");
    expect(resolver).toContain("commercial_lead_identity_conflict");
  });
  test("does not expose resolver to authenticated clients", () => {
    expect(resolver).toContain("revoke all on function app_private.resolve_commercial_lead_person");
  });
  test("historical links stay immutable with review-required conflicts", () => {
    expect(converter).toContain("commercial_lead_historical_identity_review_required");
    expect(converter).toContain("'unchanged',true");
  });
});
