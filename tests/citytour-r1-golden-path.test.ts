import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const migration = readFileSync(
  "supabase/migrations/20260907161000_citytour_r1_test_checkout_v1.sql",
  "utf8",
);
const checkout = readFileSync("supabase/functions/citytour-test-checkout/index.ts", "utf8");
const pix = readFileSync("supabase/functions/citytour-test-create-pix/index.ts", "utf8");
const landing = readFileSync("src/routes/city-tour-validacao.tsx", "utf8");

describe("City Tour R$1 TEST Golden Path", () => {
  it("resolves the QA fixture by stable key and freezes the value at 100 minor", () => {
    expect(migration).toContain("s.metadata->>'qa_fixture_key'=btrim(_fixture_key)");
    expect(migration).toContain("p.metadata->>'qa_fixture_key'=btrim(_fixture_key)");
    expect(migration).toContain("_price.unit_amount_minor <> 100");
    expect(migration).toContain("qa_environment','test'");
    expect(migration).toContain("_active_count >= 2");
  });

  it("keeps checkout RPC private to service_role", () => {
    expect(migration).toContain("revoke all on function public.create_citytour_test_checkout_order");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.create_citytour_test_checkout_order");
    expect(migration).toContain("to service_role");
  });

  it("uses only Mercado Pago TEST credentials in the City Tour Pix edge", () => {
    expect(pix).toContain('Deno.env.get("MERCADO_PAGO_TEST_ACCESS_TOKEN")');
    expect(pix).not.toContain('Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")');
    expect(pix).not.toContain("MERCADO_PAGO_ENVIRONMENT");
    expect(pix).toContain('environment: "test"');
    expect(pix).toContain('total_amount: "1.00"');
  });

  it("pins checkout and payment to the canonical QA operation and fixture", () => {
    for (const source of [checkout, pix]) {
      expect(source).toContain("CITYTO-QA-CLEAN-20260828-01");
      expect(source).toContain("citytour-r1-contract-gates-v1");
    }
  });

  it("connects the landing only to TEST-specific functions", () => {
    expect(landing).toMatch(/functions\.invoke\(\s*"citytour-test-checkout"/);
    expect(landing).toMatch(/functions\.invoke\(\s*"citytour-test-create-pix"/);
    expect(landing).not.toContain("ciosp-public-create-pix");
    expect(landing).toContain('checkout?.environment !== "test"');
    expect(landing).toContain('pixData?.environment !== "test"');
  });
});
