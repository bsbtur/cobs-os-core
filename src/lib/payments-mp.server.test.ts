import { describe, expect, it } from "bun:test";

import {
  buildSignatureManifest,
  createMercadoPagoProvider,
  mapProviderStatus,
  normalizeMercadoPagoPayment,
  signManifest,
  toCanonicalProviderEvent,
  verifyMercadoPagoSignature,
} from "./payments-mp.server";

describe("MP-01 Mercado Pago webhook signature", () => {
  it("validates the official HMAC manifest", () => {
    const secret = "test-secret";
    const manifest = buildSignatureManifest({
      dataId: "999999999",
      requestId: "req-123",
      ts: "1704908010",
    });
    expect(manifest).toBe("id:999999999;request-id:req-123;ts:1704908010;");
    const v1 = signManifest(manifest, secret);
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: `ts=1704908010,v1=${v1}`,
        requestId: "req-123",
        dataId: "999999999",
        secret,
      }),
    ).toBe(true);
  });

  it("rejects a tampered signature", () => {
    expect(
      verifyMercadoPagoSignature({
        signatureHeader: `ts=1704908010,v1=${"0".repeat(64)}`,
        requestId: "req-123",
        dataId: "999999999",
        secret: "test-secret",
      }),
    ).toBe(false);
  });
});

describe("MP-01 provider reconciliation", () => {
  it("normalizes only authoritative provider payment data", () => {
    const payment = normalizeMercadoPagoPayment({
      id: 42,
      status: "approved",
      status_detail: "accredited",
      transaction_amount: 1250,
      currency_id: "BRL",
      external_reference: "cobs:0f6a1d3c-3f2c-4a1e-8a2b-1c2d3e4f5a6b",
      date_approved: "2026-08-22T21:00:00Z",
    });
    expect(payment?.amount).toBe(1250);
    expect(toCanonicalProviderEvent(payment!)?.eventType).toBe("PAYMENT_APPROVED");
  });

  it("maps statuses centrally", () => {
    expect(mapProviderStatus("approved")).toBe("PAYMENT_APPROVED");
    expect(mapProviderStatus("pending")).toBe("PAYMENT_PENDING");
    expect(mapProviderStatus("unknown")).toBeNull();
  });

  it("does not create a real charge in MP-01", async () => {
    const provider = createMercadoPagoProvider();
    expect(
      await provider.createPayment({
        externalReference: "cobs:0f6a1d3c-3f2c-4a1e-8a2b-1c2d3e4f5a6b",
        amount: 100,
        currency: "BRL",
        paymentMethod: "pix",
        description: "QA",
      }),
    ).toBeNull();
    expect(await provider.getPayment("123")).toBeNull();
  });
});
