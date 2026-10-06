import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const route = (name: string) =>
  readFileSync(`src/routes/_authenticated/my.$operationId.${name}.tsx`, "utf8");
const operationRoot = readFileSync("src/routes/_authenticated/my.$operationId.tsx", "utf8");
const shell = readFileSync("src/app/portal/portal-shell.tsx", "utf8");
const states = readFileSync("src/app/portal/portal-states.tsx", "utf8");

const travelerRoutes = ["index", "journey", "mobility", "stay", "events", "messages", "wall", "assistant"] as const;

describe("traveler portal golden path release gate", () => {
  test("keeps operation authorization at the traveler subtree boundary", () => {
    expect(operationRoot).toContain("PortalOperationGate");
    expect(operationRoot).toContain("useMyOverview");
    expect(operationRoot).toContain("<PortalDenied");
    expect(operationRoot).toContain("<FullPageLoading");
  });

  test("keeps every golden-path destination inside the traveler shell", () => {
    for (const tab of [
      'to: "/my/$operationId"',
      'to: "/my/$operationId/journey"',
      'to: "/my/$operationId/mobility"',
      'to: "/my/$operationId/stay"',
      'to: "/my/$operationId/wall"',
      'to: "/my/$operationId/events"',
      'to: "/my/$operationId/messages"',
    ]) expect(shell).toContain(tab);
    expect(route("index")).toContain('to="/my/$operationId/assistant"');
  });

  test("keeps loading/error handling on every traveler data surface", () => {
    for (const name of travelerRoutes) expect(route(name), name).toContain("PortalQueryGate");
    expect(states).toContain("if (isLoading) return <PanelSkeleton");
    expect(states).toContain("if (error)");
    expect(states).toContain("onRetry");
  });

  test("does not expose operator chrome from golden-path traveler routes", () => {
    for (const name of travelerRoutes) {
      const source = route(name);
      expect(source, name).not.toContain("AppShell");
      expect(source, name).not.toContain("useTenant");
      expect(source, name).not.toMatch(/to=["']\/(app|operations|team|settings|commerce)/);
    }
  });

  test("keeps Home agenda precision aligned with traveler modules", () => {
    const home = route("index");
    expect(home).toContain("homeIsPlaceholderMidnight(item.start, timeZone)");
    expect(home).toContain("homeLocalDateKey(item.start, timeZone) >= today");
    expect(home).toContain("splitHomeNowNext(agenda, nowMs, timeZone)");
  });

  test("keeps Home event summary aligned with the relevant traveler event", () => {
    const home = route("index");
    expect(home).toContain("selectHomeEvent(eventRows, nowMs, timeZone)");
    expect(home).toContain('stateFor(event) === "current"');
    expect(home).toContain('stateFor(event) === "upcoming"');
    expect(home).toContain("homeEvent?.name");
    expect(home).not.toContain("firstEventName");
  });

  test("preserves read-only controls on interactive traveler surfaces", () => {
    expect(route("wall")).toContain("readOnly");
    expect(route("wall")).toContain("disabled={readOnly");
    expect(route("messages")).toContain('supabase.rpc("mark_message_read"');
  });
});
