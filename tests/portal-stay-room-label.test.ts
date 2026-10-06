import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.stay.tsx"),
  "utf8",
);

describe("traveler stay room label", () => {
  it("treats an active room without a traveler-facing label as still being finalized", () => {
    expect(source).toContain("s.myRoom.find((r) => r.active && r.label)");
    expect(source).toContain('t("w10.stay.noRoom")');
  });
});
