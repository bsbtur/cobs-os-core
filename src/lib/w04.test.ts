import { describe, expect, test } from "bun:test";

import { matchesPersonSearch, normalizePersonSearch } from "@/lib/w04";

describe("live roster search", () => {
  test("normalizes accents, case and surrounding whitespace", () => {
    expect(normalizePersonSearch("  João Gonçalves  ")).toBe("joao goncalves");
    expect(normalizePersonSearch("ÁLVARO")).toBe("alvaro");
  });

  test("finds Brazilian names without requiring accents", () => {
    expect(matchesPersonSearch("João Gonçalves", "joao")).toBe(true);
    expect(matchesPersonSearch("Márcia da Conceição", "conceicao")).toBe(true);
  });

  test("supports partial queries and an empty query", () => {
    expect(matchesPersonSearch("Ana Paula Ribeiro", "paula rib")).toBe(true);
    expect(matchesPersonSearch("Ana Paula Ribeiro", "")).toBe(true);
    expect(matchesPersonSearch(null, "")).toBe(true);
  });

  test("rejects unrelated names", () => {
    expect(matchesPersonSearch("Carlos Eduardo", "fernanda")).toBe(false);
    expect(matchesPersonSearch(null, "carlos")).toBe(false);
  });
});
