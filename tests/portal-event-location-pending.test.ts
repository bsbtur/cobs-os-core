import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.events.tsx"),
  "utf8",
);

describe("traveler event location pending", () => {
  it("shows an explicit pending location instead of hiding the venue row", () => {
    expect(source).toContain('t("w10.events.venue")');
    expect(source).toContain('venue || t("w10.events.locationPending")');
  });
});
