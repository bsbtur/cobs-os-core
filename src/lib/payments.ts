import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · MP-01 — Canonical financial foundation.
 *
 * COBS is the financial authority; Mercado Pago (or any provider) is external evidence.
 * PAYMENT ORDER != PAYMENT ATTEMPT. Amounts are always server-derived from the order.
 * payment_events is append-only; status is always DERIVED, never client-declared.
 */

export type PaymentOrderRow = Database["public"]["Tables"]["payment_orders"]["Row"];
export type PaymentAttemptRow = Database["public"]["Tables"]["payment_attempts"]["Row"];
export type PaymentEventRow = Database["public"]["Tables"]["payment_events"]["Row"];
export type PaymentProviderAccountRow =
  Database["public"]["Tables"]["payment_provider_accounts"]["Row"];

export type PaymentOrderStatus = Database["public"]["Enums"]["payment_order_status"];
export type PaymentEventType = Database["public"]["Enums"]["payment_event_type"];

export type PaymentMethod = "pix" | "credit_card" | "boleto";

export const PAYMENT_METHODS: PaymentMethod[] = ["pix", "credit_card", "boleto"];

export const PAYMENT_ORDER_STATUSES: PaymentOrderStatus[] = [
  "open",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
  "refunded",
];

export const PAYMENT_ORDER_TONE: Record<PaymentOrderStatus, string> = {
  open: "bg-elevated text-muted-foreground",
  partially_paid: "bg-warning-soft text-warning",
  paid: "bg-success-soft text-success",
  overdue: "bg-destructive/10 text-destructive",
  cancelled: "bg-elevated text-muted-foreground",
  refunded: "bg-primary/10 text-primary",
};

export type PaymentOrderTotals = {
  approved_total: number;
  refunded_total: number;
  net_paid: number;
  outstanding: number;
};

export type PaymentAttemptSummary = {
  payment_attempt_id: string;
  payment_method: PaymentMethod;
  amount: number;
  provider: string;
  provider_status: string | null;
  provider_status_detail: string | null;
  external_reference: string;
  expires_at: string | null;
  pix_ticket_url: string | null;
  created_at: string;
};

export type PaymentEventSummary = {
  id: string;
  event_type: PaymentEventType;
  amount: number | null;
  occurred_at: string;
  provider: string | null;
  reason: string | null;
};

export type PaymentOrderSummary = {
  payment_order_id: string;
  order_code: string;
  description: string;
  currency: string;
  amount_total: number;
  due_at: string | null;
  status: PaymentOrderStatus;
  totals: PaymentOrderTotals;
  attempts: PaymentAttemptSummary[];
  events: PaymentEventSummary[];
};

/** A terminal order never accepts a new attempt. Mirrors create_payment_attempt. */
export function acceptsNewAttempt(status: PaymentOrderStatus) {
  return status === "open" || status === "partially_paid" || status === "overdue";
}

/** Cancellation is denied once money settled. Mirrors cancel_payment_order. */
export function canCancelOrder(status: PaymentOrderStatus) {
  return status !== "paid" && status !== "refunded" && status !== "cancelled";
}

/** Opaque provider reference minted by the backend — never a person, order code or email. */
export function isOpaqueExternalReference(value: string) {
  return /^cobs:[0-9a-f-]{36}$/.test(value);
}

/** Decimal input (pt-BR or en-US) → normalized 2-decimal amount, or null when invalid. */
export function parseAmount(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}
