import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/payments-reconcile-pending/index.ts", "utf8");

describe("payments reconcile environment boundary", () => {
  it("fails closed when payment environment is missing or unknown", () => {
    expect(source).not.toMatch(/metadata\?\.environment\s*\?\?\s*charge\?\.metadata\?\.environment\s*\?\?\s*["']production["']/);
    expect(source).toContain('environment !== "test" && environment !== "production"');
    expect(source).toContain('error: "invalid_payment_environment"');
  });

  it("selects provider credentials only for explicit environments", () => {
    expect(source).toContain('environment === "test" ? MP_TEST_ACCESS_TOKEN : MP_ACCESS_TOKEN');
  });
});
