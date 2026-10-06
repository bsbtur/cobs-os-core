import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.mobility.tsx"),
  "utf8",
);

describe("traveler mobility card hierarchy", () => {
  it("renders route as primary content and mode as a tag", () => {
    expect(source).toContain('text-base font-semibold leading-snug');
    expect(source).toContain('<PortalTag>');
    expect(source).toContain('{t(mode.labelKey)}');
  });

  it("collapses fully unknown departure and arrival into one pending line", () => {
    expect(source).toContain('!leg.plannedDeparture');
    expect(source).toContain('!leg.expectedDeparture');
    expect(source).toContain('!leg.plannedArrival');
    expect(source).toContain('!leg.expectedArrival');
    expect(source).toContain('t("w10.mobility.timesPending")');
  });
});
