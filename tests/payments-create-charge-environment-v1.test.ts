import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "supabase/functions/payments-create-charge/index.ts",
  "utf8",
);

describe("payments-create-charge environment isolation v1", () => {
  test("uses the canonical commerce classifiers before choosing payment environment", () => {
    expect(source).toContain('userClient.rpc("list_orders_by_environment"');
    expect(source).toContain('_environment: "qa"');
    expect(source).toContain('_environment: "production"');
    expect(source).toContain('const environment = isQa ? "test" : "production";');
  });

  test("fails closed when the order is ambiguous or unclassified", () => {
    expect(source).toContain('if (isQa === isProduction) return { error: "payment_environment_unclassified" } as const;');
    expect(source).not.toContain('const environment = isQa ? "test" : MP_ENVIRONMENT;');
  });

  test("never reuses charges or attempts from another payment environment", () => {
    expect(source).toContain('candidate?.metadata?.environment === paymentEnvironment');
    expect(source).toContain('charge_environment_mismatch');
    expect(source).toContain('metadata: { payment_method_id: "pix", environment: paymentEnvironment }');
  });

  test("uses the test credential for QA and the production credential only for production", () => {
    expect(source).toContain('MERCADO_PAGO_TEST_ACCESS_TOKEN');
    expect(source).toContain('paymentEnvironment === "test"');
    expect(source).toContain('authorization: `Bearer ${mpAccessToken}`');
    expect(source).not.toContain('authorization: `Bearer ${MP_ACCESS_TOKEN}`');
  });
});
