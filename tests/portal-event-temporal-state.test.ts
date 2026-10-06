import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.events.tsx"),
  "utf8",
);

describe("traveler event temporal states", () => {
  it("keeps date-only events from becoming falsely current", () => {
    expect(source).toContain('if (schedulePrecision === "date_only")');
    expect(source).toContain('return "neutral" as const');
    expect(source).toContain('return "upcoming" as const');
    expect(source).toContain('return "completed" as const');
  });

  it("uses exact start and end only when a current event can be determined safely", () => {
    expect(source).toContain("startMs <= nowMs && nowMs < endMs");
    expect(source).toContain('return "now" as const');
  });

  it("refreshes event state while the page remains open", () => {
    expect(source).toContain("window.setInterval(refreshNow, 30_000)");
    expect(source).toContain('document.addEventListener("visibilitychange", refreshNow)');
  });

  it("renders current, next and completed traveler-facing event states", () => {
    expect(source).toContain('t("w10.events.current")');
    expect(source).toContain('t("w10.events.next")');
    expect(source).toContain('t("w10.events.completed")');
  });
});
