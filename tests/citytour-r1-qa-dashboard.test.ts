import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const dashboard = readFileSync("src/routes/_authenticated/qa.citytour-r1.tsx", "utf8");

describe("City Tour R$1 QA dashboard", () => {
  it("pins reads to the canonical TEST fixture", () => {
    expect(dashboard).toContain('CITYTO-QA-CLEAN-20260828-01');
    expect(dashboard).toContain('citytour-r1-contract-gates-v1');
    expect(dashboard).toContain('.eq("tenant_id", tenant!.id)');
    expect(dashboard).toContain('.eq("metadata->>qa_fixture_key", FIXTURE_KEY)');
  });

  it("is read-only and never invokes payment, invitation or contract mutation", () => {
    expect(dashboard).not.toContain('.insert(');
    expect(dashboard).not.toContain('.update(');
    expect(dashboard).not.toContain('.delete(');
    expect(dashboard).not.toContain('functions.invoke');
    expect(dashboard).not.toContain('invite_participant_access');
    expect(dashboard).not.toContain('accept_participant_access_invitation');
    expect(dashboard).not.toContain('contracts-generate');
    expect(dashboard).not.toContain('citytour-test-create-pix');
  });

  it("tracks the pure-traveler release gate without creating Membership", () => {
    expect(dashboard).toContain('.from("participant_access_grants")');
    expect(dashboard).toContain('.from("memberships")');
    expect(dashboard).toContain('slot.membershipCount === 0');
    expect(dashboard).toContain('o alvo de QA é 0');
  });

  it("links controlled follow-up to canonical operational surfaces", () => {
    expect(dashboard).toContain('to="/operations/$operationId/people"');
    expect(dashboard).toContain('to="/operations/$operationId/contract-readiness"');
    expect(dashboard).toContain('to="/operations/$operationId/contracts"');
  });
});
