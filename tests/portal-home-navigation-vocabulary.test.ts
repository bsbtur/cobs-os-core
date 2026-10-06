import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/lib/i18n-w10.ts"),
  "utf8",
);

describe("traveler home navigation vocabulary", () => {
  it("aligns Home shortcuts with canonical navigation labels in pt-BR", () => {
    expect(source).toContain('"w10.home.journeyShortcut": "Cronograma"');
    expect(source).toContain('"w10.home.eventShortcut": "Programação"');
  });

  it("does not imply every traveler datum is already confirmed", () => {
    expect(source).toContain('"w10.home.confirmedInfo": "COBS · informações da viagem"');
    expect(source).not.toContain('"w10.home.confirmedInfo": "COBS · informações confirmadas"');
  });
});
