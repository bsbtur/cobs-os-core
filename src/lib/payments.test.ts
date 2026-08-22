import { describe, expect, it } from "bun:test";

import {
  acceptsNewAttempt,
  canCancelOrder,
  isOpaqueExternalReference,
  parseAmount,
} from "./payments";

describe("MP-01 payment order lifecycle", () => {
  it("accepts attempts only while money is still owed", () => {
    expect(acceptsNewAttempt("open")).toBe(true);
    expect(acceptsNewAttempt("partially_paid")).toBe(true);
    expect(acceptsNewAttempt("overdue")).toBe(true);
    expect(acceptsNewAttempt("paid")).toBe(false);
    expect(acceptsNewAttempt("cancelled")).toBe(false);
    expect(acceptsNewAttempt("refunded")).toBe(false);
  });

  it("never cancels an order whose money already settled", () => {
    expect(canCancelOrder("open")).toBe(true);
    expect(canCancelOrder("overdue")).toBe(true);
    expect(canCancelOrder("paid")).toBe(false);
    expect(canCancelOrder("refunded")).toBe(false);
    expect(canCancelOrder("cancelled")).toBe(false);
  });
});

describe("MP-01 external reference", () => {
  it("only accepts the opaque backend-minted form", () => {
    expect(isOpaqueExternalReference("cobs:0f6a1d3c-3f2c-4a1e-8a2b-1c2d3e4f5a6b")).toBe(true);
    expect(isOpaqueExternalReference("maria@example.com")).toBe(false);
    expect(isOpaqueExternalReference("PO-ABC123")).toBe(false);
    expect(isOpaqueExternalReference("cobs:not-a-uuid")).toBe(false);
  });
});

describe("MP-01 amount parsing", () => {
  it("normalizes pt-BR and en-US decimals", () => {
    expect(parseAmount("1250,50")).toBe(1250.5);
    expect(parseAmount("1250.5")).toBe(1250.5);
    expect(parseAmount(" 90 ")).toBe(90);
  });

  it("rejects non-positive and malformed amounts", () => {
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-10")).toBeNull();
    expect(parseAmount("10,999")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});
