import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.events.tsx"),
  "utf8",
);

describe("traveler event date-only state", () => {
  it("shows a pending-date message instead of a dash when the date is still unknown", () => {
    expect(source).toContain('dateRange');
    expect(source).toContain('t("w10.events.datePending")');
    expect(source).toContain('timeToConfirmLabel(locale)');
  });
});
