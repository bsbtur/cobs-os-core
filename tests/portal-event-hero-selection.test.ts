import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.events.tsx"),
  "utf8",
);

describe("traveler event hero selection", () => {
  it("prefers current, then upcoming, then the first non-completed event", () => {
    const current = source.indexOf("currentEventIndex >= 0");
    const upcoming = source.indexOf("nextEventIndex >= 0");
    const relevant = source.indexOf("firstRelevantEventIndex >= 0");

    expect(current).toBeGreaterThan(-1);
    expect(upcoming).toBeGreaterThan(current);
    expect(relevant).toBeGreaterThan(upcoming);
  });

  it("uses the selected hero event for name, date and location", () => {
    expect(source).toContain("const heroEvent = eventRows[heroEventIndex] ?? null");
    expect(source).toContain("heroEvent?.name");
    expect(source).toContain("heroEvent.plannedStart");
    expect(source).toContain("heroEvent.venue?.name");
  });
});
