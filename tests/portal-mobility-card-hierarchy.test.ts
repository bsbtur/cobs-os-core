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

  it("de-emphasizes and compacts completed cards only on mobile", () => {
    expect(source).toContain("bg-muted/20 opacity-80 !p-3 sm:!p-4");
    expect(source).toContain('isCompleted ? "space-y-2 sm:space-y-3" : "space-y-3"');
    expect(source).toContain("mt-2 grid gap-1.5 sm:mt-3 sm:grid-cols-2 sm:gap-2");
    expect(source).toContain("mt-2 border-t border-border/70 pt-2 sm:mt-3 sm:pt-3");
  });
});
