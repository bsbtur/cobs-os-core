import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/lib/i18n-w10.ts"), "utf8");

describe("traveler home canonical copy", () => {
  it("uses Cronograma and Programação in pt-BR Home supporting copy", () => {
    expect(source).toContain("cronograma, transporte, hospedagem e avisos importantes");
    expect(source).toContain("Acesse cronograma, transporte, hospedagem, programação, avisos");
  });
});
