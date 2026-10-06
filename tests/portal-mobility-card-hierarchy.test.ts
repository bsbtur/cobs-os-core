import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.mobility.tsx"),
  "utf8",
);

describe("traveler mobility card hierarchy", () => {
  it("keeps canonical list order while using a separate current-or-next spotlight", () => {
    expect(source).toContain("const spotlightIndex = currentLegIndex >= 0 ? currentLegIndex : nextLegIndex");
    expect(source).toContain("legs.map((leg, index) =>");
  });

  it("renders origin and destination as the main route axis", () => {
    expect(source).toContain('t("w10.mobility.origin")');
    expect(source).toContain('t("w10.mobility.destination")');
    expect(source).toContain("<ArrowRight");
  });

  it("separates departure and arrival into mobile-friendly blocks", () => {
    expect(source).toContain("sm:grid-cols-2");
    expect(source).toContain('t("w10.mobility.departure")');
    expect(source).toContain('t("w10.mobility.arrival")');
    expect(source).toContain("border-dashed");
  });

  it("renders stops as readable stacked items on mobile", () => {
    expect(source).toContain('t("w10.mobility.stops")');
    expect(source).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(source).toContain("bg-muted/25");
  });
});
