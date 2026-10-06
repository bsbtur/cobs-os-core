import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.stay.tsx"),
  "utf8",
);

describe("traveler stay address", () => {
  it("prefers the canonical address label without appending city/region twice", () => {
    expect(source).toContain("s.property?.addressLabel ??");
    expect(source).toContain('[s.property?.city, s.property?.region]');
  });
});
