import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.events.tsx"),
  "utf8",
);

describe("traveler event session temporal states", () => {
  it("does not infer current from placeholder midnight values", () => {
    expect(source).toContain("sessionIsPlaceholderMidnight");
    expect(source).toContain("!startPlaceholder");
    expect(source).toContain("!endPlaceholder");
  });

  it("requires an exact start and end window for a current session", () => {
    expect(source).toContain("startMs <= nowMs");
    expect(source).toContain("nowMs < endMs");
    expect(source).toContain('return "now" as const');
  });

  it("renders now, next and completed labels for sessions", () => {
    expect(source).toContain('t("w10.events.sessionCurrent")');
    expect(source).toContain('t("w10.events.sessionNext")');
    expect(source).toContain('t("w10.events.sessionCompleted")');
  });
});
