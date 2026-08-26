import { describe, expect, test } from "bun:test";

import { effectiveWindow, isOperationTerminal, type OperationRow } from "@/lib/w02";

describe("W02 release gate lifecycle", () => {
  test("only completed and cancelled operations are terminal", () => {
    expect(isOperationTerminal("draft")).toBe(false);
    expect(isOperationTerminal("planning")).toBe(false);
    expect(isOperationTerminal("ready")).toBe(false);
    expect(isOperationTerminal("active")).toBe(false);
    expect(isOperationTerminal("completed")).toBe(true);
    expect(isOperationTerminal("cancelled")).toBe(true);
  });

  test("effective window does not fabricate a forecast when expected window is absent", () => {
    const op = {
      planned_start: "2027-01-25T10:00:00.000Z",
      planned_end: "2027-01-31T23:00:00.000Z",
      expected_start: null,
      expected_end: null,
    } as OperationRow;

    expect(effectiveWindow(op)).toEqual({
      start: "2027-01-25T10:00:00.000Z",
      end: "2027-01-31T23:00:00.000Z",
      isForecast: false,
    });
  });

  test("explicit expected window remains the effective forecast", () => {
    const op = {
      planned_start: "2027-01-25T10:00:00.000Z",
      planned_end: "2027-01-31T23:00:00.000Z",
      expected_start: "2027-01-25T11:00:00.000Z",
      expected_end: "2027-02-01T00:00:00.000Z",
    } as OperationRow;

    expect(effectiveWindow(op)).toEqual({
      start: "2027-01-25T11:00:00.000Z",
      end: "2027-02-01T00:00:00.000Z",
      isForecast: true,
    });
  });
});
