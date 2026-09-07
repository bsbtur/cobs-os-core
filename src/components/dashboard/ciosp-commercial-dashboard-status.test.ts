import { describe, expect, it } from "vitest";

import { formatOrderStatus } from "./ciosp-commercial-dashboard-status";

describe("formatOrderStatus", () => {
  it.each([
    ["draft", "Rascunho"],
    ["confirmed", "Confirmado"],
    ["cancelled", "Cancelado"],
    ["completed", "Concluído"],
  ])("traduz o status %s", (status, expected) => {
    expect(formatOrderStatus(status, false)).toBe(expected);
  });

  it("prioriza o estado financeiro aguardando Pix", () => {
    expect(formatOrderStatus("submitted", true)).toBe("Aguardando Pix");
  });

  it("sinaliza pedido enviado sem Pix ativo para acompanhamento", () => {
    expect(formatOrderStatus("submitted", false)).toBe("Pix requer nova tentativa");
  });

  it("preserva um status futuro ainda não mapeado", () => {
    expect(formatOrderStatus("future_status", false)).toBe("future_status");
  });
});
