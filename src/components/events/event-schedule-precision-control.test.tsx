import { describe, expect, it } from "vitest";

function nextLabel(precision: "datetime" | "date_only") {
  return precision === "date_only" ? "Data e horário confirmados" : "Horário a confirmar";
}

describe("event schedule precision control labels", () => {
  it("offers date-only mode from datetime", () => {
    expect(nextLabel("datetime")).toBe("Horário a confirmar");
  });

  it("offers datetime mode from date-only", () => {
    expect(nextLabel("date_only")).toBe("Data e horário confirmados");
  });
});
