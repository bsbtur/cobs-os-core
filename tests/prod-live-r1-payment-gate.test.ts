import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/prod-live-r1-payment-gate/index.ts", "utf8");
const protocol = readFileSync("docs/release/prod-live-r1-payment-gate.md", "utf8");

describe("PROD LIVE R$1 payment gate safety lock", () => {
  it("pins the controlled amount and production environment", () => {
    expect(source).toContain("amount_minor: 100");
    expect(source).toContain('currency: "BRL"');
    expect(source).toContain('environment: "production"');
    expect(source).toContain('provider: "mercado_pago"');
    expect(source).toContain('method: "pix"');
  });

  it("cannot create a real provider charge in the preparation commit", () => {
    expect(source).toContain('error: "live_r1_gate_locked"');
    expect(source).toContain("charge_execution_enabled: false");
    expect(source).not.toContain("api.mercadopago.com");
    expect(source).not.toContain("MERCADO_PAGO_ACCESS_TOKEN");
    expect(source).not.toContain('.from("payment_charges").insert');
    expect(source).not.toContain('.from("payment_attempts").insert');
  });

  it("documents the human checkpoint and exactly-once acceptance criteria", () => {
    expect(protocol).toContain("explicit human approval");
    expect(protocol).toContain("exactly one `PAYMENT_RECORDED`");
    expect(protocol).toContain("`sales_public` remains false");
    expect(protocol).toContain("fixture must be retired/disabled");
  });
});
