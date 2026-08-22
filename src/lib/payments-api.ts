import { z } from "zod";

import type { PaymentMethod } from "@/lib/payments";

export const paymentAttemptRequestSchema = z
  .object({
    payment_order_id: z.string().uuid(),
    payment_method: z.enum(["pix", "credit_card", "boleto"]),
    idempotency_key: z.string().trim().min(8).max(120),
  })
  .strict();

export type PaymentAttemptRequest = z.infer<typeof paymentAttemptRequestSchema>;

export function sanitizePaymentAttemptResponse(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const { secret_reference: _secretReference, ...safe } = source;
  return safe;
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return value === "pix" || value === "credit_card" || value === "boleto";
}
