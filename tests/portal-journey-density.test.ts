import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.journey.tsx"),
  "utf8",
);

describe("traveler journey expanded-card density", () => {
  it("keeps confirmed-source guidance inside the expanded details instead of a standalone collapsed block", () => {
    const detailsButton = source.indexOf('t("w10.journey.showDetails")');
    const confirmedGuidance = source.indexOf('t("w10.journey.officialSourceBody")');
    expect(detailsButton).toBeGreaterThan(-1);
    expect(confirmedGuidance).toBeGreaterThan(detailsButton);
  });

  it("uses a lighter expanded container without another full nested card", () => {
    expect(source).toContain('className="mt-2 px-1 pb-1 pt-2"');
    expect(source).not.toContain('mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/25 p-4');
  });
});
