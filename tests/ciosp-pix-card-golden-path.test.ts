import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const card = readFileSync("supabase/functions/ciosp-public-pay-card/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/payments-mercado-pago-webhook/index.ts", "utf8");
const checkout = readFileSync("src/routes/ciosp-2027_.reserva.tsx", "utf8");

describe("CIOSP two-stage Pix + card checkout", () => {
  test("requires the Pix entry before card balance", () => {
    expect(card).toContain('if (paid < ENTRY_MINOR)');
    expect(card).toContain('"entry_not_confirmed"');
  });

  test("never persists the raw card token in the local request snapshot", () => {
    expect(card).toContain("card_token_present: true");
    expect(card).not.toContain("request_snapshot: providerBody");
    expect(card).not.toContain("request_snapshot: { token:");
  });

  test("uses Mercado Pago card token only in the transient provider request", () => {
    expect(card).toContain('type: "credit_card", token: cardToken, installments');
    expect(card).toContain('"x-idempotency-key": idempotencyKey');
  });

  test("confirms the order only when recorded payments reach the grand total", () => {
    expect(webhook).toContain("netPaid >= Number(orderRow.grand_total_minor ?? 0)");
  });

  test("renders card step only after the confirmed entry", () => {
    expect(checkout).toContain("orderStatus.received_minor >= 349000");
    expect(checkout).toContain("ciosp-public-pay-card");
    expect(checkout).toContain("VITE_MERCADO_PAGO_PUBLIC_KEY");
  });
});
