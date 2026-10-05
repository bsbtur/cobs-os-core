import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const CANONICAL_OPERATION_CODE = "CIOSP-SP-2027-COMMERCIAL";
const LEGACY_EXACT_LITERAL = /(["'])CIOSP-SP-2027\1/;

const runtimeEntrypoints = [
  "supabase/functions/ciosp-public-checkout/index.ts",
  "supabase/functions/ciosp-public-create-pix/index.ts",
  "supabase/functions/ciosp-public-create-preference/index.ts",
  "supabase/functions/ciosp-public-pay-card/index.ts",
  "supabase/functions/ciosp-public-lead-capture/index.ts",
  "supabase/functions/ciosp-public-checkout-pro/index.ts",
];

describe("CIOSP commercial operation canonical routing", () => {
  test.each(runtimeEntrypoints)("%s resolves only the commercial operation code", (path) => {
    const source = readFileSync(path, "utf8");

    expect(source).toContain(CANONICAL_OPERATION_CODE);
    expect(source).not.toMatch(LEGACY_EXACT_LITERAL);
  });

  test("checkout creates the order against the same canonical code it resolves", () => {
    const source = readFileSync(
      "supabase/functions/ciosp-public-checkout/index.ts",
      "utf8",
    );

    expect(source).toContain('const CODE="CIOSP-SP-2027-COMMERCIAL"');
    expect(source).toContain('_operation_code:CODE');
    expect(source).toContain('.eq("code",CODE)');
  });

  test("Pix rejects orders from any non-canonical operation", () => {
    const source = readFileSync(
      "supabase/functions/ciosp-public-create-pix/index.ts",
      "utf8",
    );

    expect(source).toContain('const CODE="CIOSP-SP-2027-COMMERCIAL"');
    expect(source).toContain("op.code!==CODE");
    expect(source).toContain('"order_not_canonical_ciops"');
  });

  test("lead capture resolves the same commercial operation", () => {
    const source = readFileSync(
      "supabase/functions/ciosp-public-lead-capture/index.ts",
      "utf8",
    );

    expect(source).toContain(
      'const OPERATION_CODE = "CIOSP-SP-2027-COMMERCIAL"',
    );
    expect(source).toContain('.eq("code", OPERATION_CODE)');
  });
});
