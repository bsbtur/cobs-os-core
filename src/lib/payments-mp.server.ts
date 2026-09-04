import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { PaymentEventType } from "@/lib/payments";

export type ProviderPayment = {
  provider_payment_id: string;
  status: string;
  status_detail: string | null;
  amount: number;
  currency: string;
  external_reference: string | null;
  approved_at: string | null;
  pix_qr_code?: string | null;
  pix_qr_code_base64?: string | null;
  pix_ticket_url?: string | null;
};

export type PaymentProvider = {
  readonly name: string;
  createPayment(input: {
    externalReference: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    description: string;
    payerEmail: string;
    idempotencyKey: string;
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

export const MP_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
export const MP_SIGNATURE_FUTURE_SKEW_MS = 60 * 1000;

export const EVENT_TYPE_BY_PROVIDER_STATUS: Record<string, PaymentEventType> = {
  pending: "PAYMENT_PENDING",
  in_process: "PAYMENT_PENDING",
  in_mediation: "PAYMENT_PENDING",
  authorized: "PAYMENT_PENDING",
  created: "PAYMENT_PENDING",
  processing: "PAYMENT_PENDING",
  action_required: "PAYMENT_PENDING",
  approved: "PAYMENT_APPROVED",
  processed: "PAYMENT_APPROVED",
  rejected: "PAYMENT_REJECTED",
  failed: "PAYMENT_REJECTED",
  cancelled: "PAYMENT_CANCELLED",
  canceled: "PAYMENT_CANCELLED",
  expired: "PAYMENT_EXPIRED",
  refunded: "PAYMENT_REFUNDED",
  charged_back: "PAYMENT_REFUNDED",
};

export function mapProviderStatus(status: string): PaymentEventType | null {
  return EVENT_TYPE_BY_PROVIDER_STATUS[status] ?? null;
}

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

export function isMercadoPagoSignatureTimestampFresh(
  ts: string,
  nowMs = Date.now(),
): boolean {
  if (!/^[0-9]+$/.test(ts)) return false;
  const timestampSeconds = Number(ts);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  const timestampMs = timestampSeconds * 1000;
  if (!Number.isSafeInteger(timestampMs)) return false;
  const ageMs = nowMs - timestampMs;
  return ageMs <= MP_SIGNATURE_MAX_AGE_MS && ageMs >= -MP_SIGNATURE_FUTURE_SKEW_MS;
}

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
  nowMs?: number;
}): boolean {
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (!parsed || !input.dataId) return false;
  if (!isMercadoPagoSignatureTimestampFresh(parsed.ts, input.nowMs ?? Date.now())) return false;
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

const amountSchema = z.union([z.number().positive(), z.string().regex(/^\d+(?:\.\d{1,2})?$/)]);

const providerOrderSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  status_detail: z.string().nullable().optional(),
  total_amount: amountSchema,
  external_reference: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  currency_id: z.string().nullable().optional(),
  last_updated_date: z.string().nullable().optional(),
  transactions: z
    .object({
      payments: z
        .array(
          z.object({
            status: z.string().min(1).optional(),
            status_detail: z.string().nullable().optional(),
            payment_method: z
              .object({
                qr_code: z.string().nullable().optional(),
                qr_code_base64: z.string().nullable().optional(),
                ticket_url: z.string().url().nullable().optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export function normalizeMercadoPagoOrder(value: unknown): ProviderPayment | null {
  const parsed = providerOrderSchema.safeParse(value);
  if (!parsed.success) return null;

  const payment = parsed.data.transactions?.payments?.[0];
  const amount =
    typeof parsed.data.total_amount === "number"
      ? parsed.data.total_amount
      : Number(parsed.data.total_amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const country = parsed.data.country_code?.toUpperCase();
  const currency = parsed.data.currency_id ?? (country === "BR" || country === "BRA" ? "BRL" : "");
  if (!currency) return null;

  return {
    provider_payment_id: parsed.data.id,
    status: payment?.status ?? parsed.data.status,
    status_detail: payment?.status_detail ?? parsed.data.status_detail ?? null,
    amount,
    currency,
    external_reference: parsed.data.external_reference ?? null,
    approved_at:
      (payment?.status ?? parsed.data.status) === "processed"
        ? (parsed.data.last_updated_date ?? null)
        : null,
    pix_qr_code: payment?.payment_method?.qr_code ?? null,
    pix_qr_code_base64: payment?.payment_method?.qr_code_base64 ?? null,
    pix_ticket_url: payment?.payment_method?.ticket_url ?? null,
  };
}

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

export function createMercadoPagoProvider(options?: {
  accessToken?: string | undefined;
  lookup?: (id: string) => Promise<ProviderPayment | null>;
  request?: typeof fetch;
}): PaymentProvider {
  const lookup = options?.lookup;
  const accessToken = options?.accessToken;
  const request = options?.request ?? fetch;

  return {
    name: "mercadopago",
    async createPayment(input) {
      if (!accessToken || input.paymentMethod !== "pix" || input.currency !== "BRL") return null;
      if (!input.payerEmail || !input.idempotencyKey || input.amount <= 0) return null;

      const amount = input.amount.toFixed(2);
      const response = await request("https://api.mercadopago.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          type: "online",
          total_amount: amount,
          external_reference: input.externalReference,
          processing_mode: "automatic",
          transactions: {
            payments: [
              {
                amount,
                payment_method: { id: "pix", type: "bank_transfer" },
              },
            ],
          },
          payer: { email: input.payerEmail },
        }),
      });
      if (!response.ok) return null;
      return normalizeMercadoPagoOrder(await response.json().catch(() => null));
    },
    async getPayment(providerOrderId: string) {
      if (lookup) return lookup(providerOrderId);
      if (!accessToken) return null;

      const response = await request(
        `https://api.mercadopago.com/v1/orders/${encodeURIComponent(providerOrderId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        },
      );
      if (!response.ok) return null;
      return normalizeMercadoPagoOrder(await response.json().catch(() => null));
    },
    async refundPayment() {
      return null;
    },
  };
}
