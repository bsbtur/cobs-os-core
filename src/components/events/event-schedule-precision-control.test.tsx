import { describe, expect, test } from "bun:test";

function nextLabel(precision: "datetime" | "date_only") {
  return precision === "date_only" ? "Data e horário confirmados" : "Horário a confirmar";
}

describe("event schedule precision control labels", () => {
  test("offers date-only mode from datetime", () => {
    expect(nextLabel("datetime")).toBe("Horário a confirmar");
  });

  test("offers datetime mode from date-only", () => {
    expect(nextLabel("date_only")).toBe("Data e horário confirmados");
  });
});
