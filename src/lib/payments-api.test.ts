import { describe, expect, it } from "bun:test";

import { paymentAttemptRequestSchema, sanitizePaymentAttemptResponse } from "./payments-api";

describe("MP-01 payment attempts API contract", () => {
  it("accepts only order, method and idempotency key", () => {
    expect(
      paymentAttemptRequestSchema.safeParse({
        payment_order_id: "0f6a1d3c-3f2c-4a1e-8a2b-1c2d3e4f5a6b",
        payment_method: "pix",
        idempotency_key: "qa-key-123456",
      }).success,
    ).toBe(true);
  });

  it("rejects a browser-supplied amount", () => {
    expect(
      paymentAttemptRequestSchema.safeParse({
        payment_order_id: "0f6a1d3c-3f2c-4a1e-8a2b-1c2d3e4f5a6b",
        payment_method: "pix",
        idempotency_key: "qa-key-123456",
        amount: 1,
      }).success,
    ).toBe(false);
  });

  it("never exposes secret_reference", () => {
    const safe = sanitizePaymentAttemptResponse({
      payment_attempt_id: "attempt-1",
      amount: 100,
      provider: "mercadopago",
      secret_reference: "MP_ACCESS_TOKEN_PRODUCTION",
    });
    expect(safe?.secret_reference).toBeUndefined();
    expect(safe?.payment_attempt_id).toBe("attempt-1");
  });
});
