import { describe, expect, it } from "bun:test";

import {
  buildSignatureManifest,
  createMercadoPagoProvider,
  mapProviderStatus,
  normalizeMercadoPagoOrder,
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

describe("Mercado Pago Orders provider", () => {
  it("keeps legacy Payments normalization covered", () => {
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

  it("normalizes Pix QR data from an Orders response", () => {
    const order = normalizeMercadoPagoOrder({
      id: "ORD01JP84C939T20S0P1DN382FQ6K",
      external_reference: "cobs:0f6a1d3c-3f2c-4a1e-8a2b-1c2d3e4f5a6b",
      total_amount: "50.00",
      country_code: "BRA",
      status: "action_required",
      status_detail: "waiting_transfer",
      last_updated_date: "2026-08-22T22:00:00Z",
      transactions: {
        payments: [
          {
            status: "action_required",
            status_detail: "waiting_transfer",
            payment_method: {
              qr_code: "000201-cobs-pix",
              qr_code_base64: "aW1hZ2U=",
              ticket_url: "https://www.mercadopago.com.br/payments/test/ticket",
            },
          },
        ],
      },
    });

    expect(order?.provider_payment_id).toBe("ORD01JP84C939T20S0P1DN382FQ6K");
    expect(order?.amount).toBe(50);
    expect(order?.currency).toBe("BRL");
    expect(order?.pix_qr_code).toBe("000201-cobs-pix");
    expect(order?.pix_ticket_url).toContain("mercadopago.com.br");
    expect(toCanonicalProviderEvent(order!)?.eventType).toBe("PAYMENT_PENDING");
  });

  it("creates Pix through POST /v1/orders with payer and idempotency", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const request = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          id: "ORD01TESTPIX",
          total_amount: "100.00",
          country_code: "BRA",
          status: "action_required",
          status_detail: "waiting_transfer",
          external_reference: "cobs:0f6a1d3c-3f2c-4a1e-8a2b-1c2d3e4f5a6b",
          transactions: {
            payments: [
              {
                status: "action_required",
                status_detail: "waiting_transfer",
                payment_method: { qr_code: "pix-copy-paste" },
              },
            ],
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = createMercadoPagoProvider({
      accessToken: "APP_USR-test",
      request: request as typeof fetch,
    });
    const created = await provider.createPayment({
      externalReference: "cobs:0f6a1d3c-3f2c-4a1e-8a2b-1c2d3e4f5a6b",
      amount: 100,
      currency: "BRL",
      paymentMethod: "pix",
      description: "QA",
      payerEmail: "test_user_br@testuser.com",
      idempotencyKey: "cobs-test-idempotency-123",
    });

    expect(capturedUrl).toBe("https://api.mercadopago.com/v1/orders");
    expect(new Headers(capturedInit?.headers).get("X-Idempotency-Key")).toBe(
      "cobs-test-idempotency-123",
    );
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.payer.email).toBe("test_user_br@testuser.com");
    expect(body.transactions.payments[0].payment_method.id).toBe("pix");
    expect(created?.provider_payment_id).toBe("ORD01TESTPIX");
    expect(created?.pix_qr_code).toBe("pix-copy-paste");
  });

  it("keeps non-Pix creation disabled", async () => {
    const provider = createMercadoPagoProvider({ accessToken: "APP_USR-test" });
    expect(
      await provider.createPayment({
        externalReference: "cobs:0f6a1d3c-3f2c-4a1e-8a2b-1c2d3e4f5a6b",
        amount: 100,
        currency: "BRL",
        paymentMethod: "credit_card",
        description: "QA",
        payerEmail: "test@example.com",
        idempotencyKey: "cobs-test-idempotency-456",
      }),
    ).toBeNull();
  });

  it("maps final Orders statuses centrally", () => {
    expect(mapProviderStatus("processed")).toBe("PAYMENT_APPROVED");
    expect(mapProviderStatus("failed")).toBe("PAYMENT_REJECTED");
    expect(mapProviderStatus("canceled")).toBe("PAYMENT_CANCELLED");
    expect(mapProviderStatus("refunded")).toBe("PAYMENT_REFUNDED");
    expect(mapProviderStatus("unknown")).toBeNull();
  });
});
