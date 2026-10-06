import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/routes/_authenticated/my.$operationId.mobility.tsx"),
  "utf8",
);

describe("traveler mobility mode classification", () => {
  it("prioritizes road leg_kind over airport text", () => {
    expect(source).toContain('leg.legKind === "transfer"');
    expect(source).toContain('leg.legKind === "shuttle"');
    expect(source).toContain('leg.legKind === "return"');
  });

  it("does not use airport codes or airport names as air-mode evidence", () => {
    expect(source).not.toContain("/aeroporto|bsb|cgh|congonhas|voo|aéreo/");
    expect(source).toContain("\\b(voo|aéreo|aerea|aérea|flight)\\b");
  });
});
