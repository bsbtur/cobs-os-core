import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.mobility.tsx"),
  "utf8",
);

describe("traveler mobility spotlight", () => {
  it("uses route plus the most actionable time instead of duplicating the card title", () => {
    expect(source).toContain('spotlightLeg.originLabel');
    expect(source).toContain('spotlightLeg.destinationLabel');
    expect(source).toContain('spotlightIsNow ? t("w10.mobility.arrival") : t("w10.mobility.departure")');
    expect(source).toContain('spotlightIsNow ? spotlightArrival : spotlightDeparture');
  });

  it("keeps the chronological list untouched below the spotlight", () => {
    expect(source).toContain("legs.map((leg, index) =>");
    expect(source).toContain("const spotlightIndex = currentLegIndex >= 0 ? currentLegIndex : nextLegIndex");
  });

  it("shows a completion summary only when every leg is completed", () => {
    expect(source).toContain('const allLegsCompleted = legs.length > 0 && legStates.every((state) => state === "completed")');
    expect(source).toContain('t("w10.mobility.allCompleted")');
    expect(source).toContain('t("w10.mobility.allCompletedTitle")');
    expect(source).toContain('t("w10.mobility.allCompletedBody")');
  });
});
