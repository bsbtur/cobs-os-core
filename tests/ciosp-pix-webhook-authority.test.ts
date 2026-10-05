import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const pix = readFileSync(
  "supabase/functions/ciosp-public-create-pix/index.ts",
  "utf8",
);

const webhook = readFileSync(
  "supabase/functions/payments-mercado-pago-webhook/index.ts",
  "utf8",
);

describe("CIOSP Pix webhook authority", () => {
  test("Pix function never records the financial fact synchronously", () => {
    expect(pix).not.toContain('db.rpc("record_provider_payment"');
    expect(pix).not.toContain('status:"paid"');
    expect(pix).not.toContain('paid_amount_minor:amount');
    expect(pix).not.toContain('public_checkout_sessions").update({status:"consumed"');
  });

  test("provider approval stays processing until the webhook is correlated", () => {
    expect(pix).toContain(
      'const cs=as==="approved"||as==="processing"?"processing":"pending"',
    );
    expect(pix).toContain('confirmed:false');
    expect(pix).toContain('awaiting_webhook:as==="approved"');
  });

  test("signed/correlated webhook owns payment recording", () => {
    expect(webhook).toContain('db.rpc("record_provider_payment"');
    expect(webhook).toContain('provider_correlation_mismatch');
    expect(webhook).toContain('signature_valid');
  });
});
