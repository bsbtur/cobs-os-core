import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const status = readFileSync("supabase/functions/citytour-test-order-status/index.ts", "utf8");
const roster = readFileSync("src/routes/_authenticated/operations.$operationId.people.tsx", "utf8");
const claim = readFileSync("src/routes/_authenticated/my.claim.$token.tsx", "utf8");
const boundary = readFileSync("src/routes/_authenticated/route.tsx", "utf8");
const auth = readFileSync("src/routes/auth.tsx", "utf8");

describe("City Tour TEST traveler handoff", () => {
  it("keeps the public payment status free of portal credentials and PII", () => {
    expect(status).toContain("participation_ready: participationReady");
    expect(status).not.toContain("invite_participant_access");
    expect(status).not.toContain("participant_access_invitations");
    expect(status).not.toContain("/my/claim/");
    expect(status).not.toContain("buyer_name_snapshot");
    expect(status).not.toContain("email");
  });

  it("reuses the canonical operator invitation as the only portal credential handoff", () => {
    expect(roster).toContain('supabase.rpc("invite_participant_access"');
    expect(roster).toContain('setLink(`${window.location.origin}/my/claim/${token}`)');
    expect(roster).toContain('t("roster.portal.once")');
  });

  it("claims through the canonical traveler RPC and lands in /my", () => {
    expect(claim).toContain('supabase.rpc("accept_participant_access_invitation"');
    expect(claim).toContain('to: "/my"');
    expect(claim).toContain('replace: true');
  });

  it("preserves an anonymous claim through signup without granting operator membership", () => {
    expect(boundary).toContain("claimTokenFromPath(location.pathname)");
    expect(boundary).toContain("savePendingClaim(pending)");
    expect(boundary).toContain('throw redirect({ to: "/auth", search: { redirect: location.href } })');
    expect(auth).toContain("emailRedirectTo: `${window.location.origin}${destination}`");
    expect(boundary).toContain('const UNGATED_PREFIXES = ["/my", "/invite", "/onboarding"]');
    expect(boundary).toContain("<RequireOperatorAccess>");
  });
});
