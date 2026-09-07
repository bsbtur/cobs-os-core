import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const page = readFileSync("src/routes/city-tour-validacao.tsx", "utf8");

describe("City Tour QA sales page v1", () => {
  it("publishes the R$ 1 TEST offer and two-traveler validation framing", () => {
    expect(page).toContain('createFileRoute("/city-tour-validacao")');
    expect(page).toContain("R$ 1,00");
    expect(page).toContain("QA · TEST");
    expect(page).toContain("Primeiro ciclo: dois viajantes");
  });

  it("uses only the dedicated TEST checkout/payment path", () => {
    expect(page).toContain("citytour-test-checkout");
    expect(page).toContain("citytour-test-create-pix");
    expect(page).not.toContain("ciosp-public-create-pix");
    expect(page).not.toContain("contracts-clicksign-send");
    expect(page).not.toContain("payments-create-charge");
    expect(page).toContain("Nenhuma credencial ou cobrança de produção é usada neste fluxo");
  });
});
