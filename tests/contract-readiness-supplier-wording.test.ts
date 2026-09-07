import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/operations.$operationId.contract-readiness.tsx",
  "utf8",
);

describe("contract readiness supplier wording", () => {
  test("distinguishes selected, contracted and legally complete suppliers", () => {
    expect(route).toContain('status", "in", ["selected", "contracted"]');
    expect(route).toContain('quote.status === "selected"');
    expect(route).toContain('quote.status === "contracted"');
    expect(route).toContain("selecionada(s)");
    expect(route).toContain("contratada(s)");
    expect(route).toContain("com evidência jurídica completa");
  });

  test("keeps the readiness surface read-only", () => {
    expect(route).not.toMatch(/\.insert\s*\(/);
    expect(route).not.toMatch(/\.update\s*\(/);
    expect(route).not.toMatch(/\.delete\s*\(/);
    expect(route).not.toContain("contracts-clicksign-send");
  });
});
