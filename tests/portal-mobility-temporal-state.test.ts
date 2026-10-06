import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.mobility.tsx"),
  "utf8",
);

describe("traveler mobility temporal states", () => {
  it("keeps mobility time-sensitive state live", () => {
    expect(source).toContain("const [nowMs, setNowMs] = useState(() => Date.now())");
    expect(source).toContain("window.setInterval(refreshNow, 30_000)");
    expect(source).toContain('document.addEventListener("visibilitychange", refreshNow)');
  });

  it("only marks a leg in progress when confirmed departure and arrival bound now", () => {
    expect(source).toContain('return "now" as const');
    expect(source).toContain("departureMs <= nowMs && nowMs < arrivalMs");
    expect(source).toContain("!departureIsDateOnly");
    expect(source).toContain("!arrivalIsDateOnly");
  });

  it("keeps date-only transport safe and distinguishes next and completed", () => {
    expect(source).toContain("if (departure && departureIsDateOnly)");
    expect(source).toContain('return "upcoming" as const');
    expect(source).toContain('return "completed" as const');
    expect(source).toContain('t("w10.mobility.inProgress")');
    expect(source).toContain('t("w10.mobility.next")');
    expect(source).toContain('t("w10.mobility.completed")');
  });

  it("renders a current-or-next transport spotlight", () => {
    expect(source).toContain("const spotlightIndex = currentLegIndex >= 0 ? currentLegIndex : nextLegIndex");
    expect(source).toContain('t("w10.mobility.nowLeg")');
    expect(source).toContain('t("w10.mobility.nextLeg")');
  });
});
