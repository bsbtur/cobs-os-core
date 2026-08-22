import { createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentEventType } from "@/lib/payments";

/**
 * COBS OS · MP-01 hardening — Mercado Pago signature + provider abstraction.
 *
 * The webhook is a TRIGGER, never evidence. Financial truth is always read back
 * from the provider through PaymentProvider.getPayment().
 */

export type ProviderPayment = {
  provider_payment_id: string;
  status: string;
  status_detail: string | null;
  amount: number;
  currency: string;
  external_reference: string | null;
  approved_at: string | null;
};

export type PaymentProvider = {
  readonly name: string;
  createPayment(input: {
    externalReference: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    description: string;
  }): Promise<ProviderPayment>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment | null>;
  refundPayment(providerPaymentId: string, amount?: number): Promise<ProviderPayment | null>;
};

/** Provider status → canonical COBS payment event. */
export const EVENT_TYPE_BY_PROVIDER_STATUS: Record<string, PaymentEventType> = {
  pending: "PAYMENT_PENDING",
  in_process: "PAYMENT_PENDING",
  in_mediation: "PAYMENT_PENDING",
  authorized: "PAYMENT_PENDING",
  approved: "PAYMENT_APPROVED",
  rejected: "PAYMENT_REJECTED",
  cancelled: "PAYMENT_CANCELLED",
  expired: "PAYMENT_EXPIRED",
  refunded: "PAYMENT_REFUNDED",
  charged_back: "PAYMENT_REFUNDED",
};

export function mapProviderStatus(status: string): PaymentEventType | null {
  return EVENT_TYPE_BY_PROVIDER_STATUS[status] ?? null;
}

/** `ts=1700000000,v1=abc...` → parts. */
export function parseSignatureHeader(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  const parts: Record<string, string> = {};
  for (const chunk of header.split(",")) {
    const idx = chunk.indexOf("=");
    if (idx <= 0) continue;
    parts[chunk.slice(0, idx).trim()] = chunk.slice(idx + 1).trim();
  }
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1 || !/^[0-9]+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return null;
  return { ts, v1 };
}

/** Official Mercado Pago manifest form. */
export function buildSignatureManifest(input: {
  dataId: string;
  requestId: string | null;
  ts: string;
}) {
  const id = input.dataId.toLowerCase();
  return `id:${id};${input.requestId ? `request-id:${input.requestId};` : ""}ts:${input.ts};`;
}

function safeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function signManifest(manifest: string, secret: string) {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

export function verifyMercadoPagoSignature(input: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (!parsed || !input.dataId) return false;
  const manifest = buildSignatureManifest({
    dataId: input.dataId,
    requestId: input.requestId,
    ts: parsed.ts,
  });
  return safeEqualHex(signManifest(manifest, input.secret).toLowerCase(), parsed.v1.toLowerCase());
}

/**
 * Stub provider. No real network call is performed in MP-01; a real
 * implementation replaces only the bodies below.
 */
export function createMercadoPagoProvider(options?: {
  accessToken?: string | undefined;
  lookup?: (id: string) => Promise<ProviderPayment | null>;
}): PaymentProvider {
  const lookup = options?.lookup;
  return {
    name: "mercadopago",
    async createPayment() {
      throw new Error("MercadoPagoProvider.createPayment is not enabled in this phase");
    },
    async getPayment(providerPaymentId: string) {
      if (lookup) return lookup(providerPaymentId);
      return null;
    },
    async refundPayment() {
      throw new Error("MercadoPagoProvider.refundPayment is not enabled in this phase");
    },
  };
}
