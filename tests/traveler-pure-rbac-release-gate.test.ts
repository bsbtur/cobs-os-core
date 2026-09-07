import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const authenticatedRoute = readFileSync("src/routes/_authenticated/route.tsx", "utf8");
const accessGate = readFileSync("src/app/shell/access-gate.tsx", "utf8");
const travelerRoot = readFileSync("src/routes/_authenticated/my.tsx", "utf8");
const travelerIndex = readFileSync("src/routes/_authenticated/my.index.tsx", "utf8");

describe("pure traveler RBAC release gate", () => {
  test("keeps only traveler/claim/onboarding surfaces outside operator membership gate", () => {
    const compact = authenticatedRoute.replace(/\s+/g, " ");
    expect(compact).toContain('const UNGATED_PREFIXES = ["/my", "/invite", "/onboarding"]');
    expect(authenticatedRoute).toContain("<RequireOperatorAccess>");
    for (const adminPrefix of ["/app", "/operations", "/team", "/settings", "/commerce"]) {
      expect(authenticatedRoute).not.toContain(`"${adminPrefix}"`);
    }
  });

  test("operator chrome requires an active membership and portal access never creates one", () => {
    expect(accessGate).toContain("const hasMembership = memberships.length > 0");
    expect(accessGate).toContain("if (hasMembership) return <>{children}</>");
    expect(accessGate).toContain('navigate({ to: "/my", replace: true })');
    expect(accessGate).toContain('supabase.rpc("get_my_participant_access")');
    expect(accessGate).not.toMatch(/insert\([^)]*memberships/i);
    expect(accessGate).not.toMatch(/from\(["']memberships["']\)\s*\.insert/i);
  });

  test("traveler portal remains a participant-only subtree", () => {
    expect(travelerRoot).toContain("Traveler Portal subtree. Participant surfaces only.");
    expect(travelerIndex).toContain("useMyOperations");
    expect(travelerIndex).toContain('to="/my/$operationId"');
    expect(travelerIndex).not.toContain("AppShell");
    expect(travelerIndex).not.toContain("useTenant");
  });
});
