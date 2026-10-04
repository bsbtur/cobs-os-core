import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sender = readFileSync("supabase/functions/contracts-clicksign-send/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261004020000_claim_clicksign_envelope_creation.sql", "utf8");

describe("Clicksign send atomic envelope claim", () => {
  test("database claim serializes the first envelope attempt and is service-role only", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("v_contract.status <> 'draft'");
    expect(migration).toContain("v_contract.provider_envelope_id is not null");
    expect(migration).toContain("v_metadata ? 'clicksign_envelope_attempted_at'");
    expect(migration).toContain("revoke all on function app_private.claim_clicksign_envelope_creation(uuid) from authenticated");
    expect(migration).toContain("grant execute on function app_private.claim_clicksign_envelope_creation(uuid) to service_role");\n    expect(migration).toContain("revoke all on function public.claim_clicksign_envelope_creation_service(uuid) from authenticated");\n    expect(migration).toContain("grant execute on function public.claim_clicksign_envelope_creation_service(uuid) to service_role");
  });

  test("sender must win the claim before the external envelope POST", () => {
    const claim = sender.indexOf('rpc("claim_clicksign_envelope_creation_service"');
    const providerPost = sender.indexOf('cs("/envelopes", "POST"');
    expect(claim).toBeGreaterThan(-1);
    expect(providerPost).toBeGreaterThan(claim);
    expect(sender).toContain('if (claimed !== true) return json({ error: "provider_recovery_required", stage: "envelope" }, 409)');
  });
});
