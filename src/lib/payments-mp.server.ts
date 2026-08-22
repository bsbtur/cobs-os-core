import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { PaymentEventType } from "@/lib/payments";

/**
 * COBS OS · MP-01 hardening — Mercado Pago signature + provider abstraction.
 *
 * A webhook is a trigger, never financial evidence. Financial truth is read
 * back from the provider through PaymentProvider.getPayment().
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
  }): Promise<ProviderPayment | null>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment | null>;
  refundPayment(providerPaymentId: string, amount?: number): Promise<ProviderPayment | null>;
};

export type CanonicalProviderEvent = {
  eventType: PaymentEventType;
  providerPaymentId: string;
  providerStatus: string;
  providerStatusDetail: string | null;
  externalReference: string | null;
  amount: number;
  occurredAt: string | null;
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

/** Official Mercado Pago manifest form. Missing pairs are omitted. */
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

const providerPaymentSchema = z.object({
  id: z.union([z.string(), z.number()]),
  status: z.string().min(1),
  status_detail: z.string().nullable().optional(),
  transaction_amount: z.number().positive(),
  currency_id: z.string().min(1),
  external_reference: z.string().nullable().optional(),
  date_approved: z.string().nullable().optional(),
});

export function normalizeMercadoPagoPayment(value: unknown): ProviderPayment | null {
  const parsed = providerPaymentSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    provider_payment_id: String(parsed.data.id),
    status: parsed.data.status,
    status_detail: parsed.data.status_detail ?? null,
    amount: parsed.data.transaction_amount,
    currency: parsed.data.currency_id,
    external_reference: parsed.data.external_reference ?? null,
    approved_at: parsed.data.date_approved ?? null,
  };
}

/** Only provider-reconciled data can become a COBS financial event. */
export function toCanonicalProviderEvent(payment: ProviderPayment): CanonicalProviderEvent | null {
  const eventType = mapProviderStatus(payment.status);
  if (!eventType) return null;
  return {
    eventType,
    providerPaymentId: payment.provider_payment_id,
    providerStatus: payment.status,
    providerStatusDetail: payment.status_detail,
    externalReference: payment.external_reference,
    amount: payment.amount,
    occurredAt: payment.approved_at,
  };
}

/**
 * MP-01 provider boundary. createPayment/refundPayment are intentionally disabled
 * until MP-02/MP-03. getPayment may reconcile when a server-only access token is
 * configured, or use an injected lookup in tests.
 */
export function createMercadoPagoProvider(options?: {
  accessToken?: string | undefined;
  lookup?: (id: string) => Promise<ProviderPayment | null>;
}): PaymentProvider {
  const lookup = options?.lookup;
  const accessToken = options?.accessToken;

  return {
    name: "mercadopago",
    async createPayment() {
      return null;
    },
    async getPayment(providerPaymentId: string) {
      if (lookup) return lookup(providerPaymentId);
      if (!accessToken) return null;

      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(providerPaymentId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        },
      );
      if (!response.ok) return null;
      return normalizeMercadoPagoPayment(await response.json().catch(() => null));
    },
    async refundPayment() {
      return null;
    },
  };
}
