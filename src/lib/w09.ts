import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · W09 — Commerce & Payments Core.
 *
 * OFFERING != PRICE != ORDER · BUYER != TRAVELER · RESERVATION != PARTICIPATION.
 * Money is BIGINT minor units only — never floating point financial truth.
 * COBS never processes money: a payment is MANUAL, externally verified evidence.
 * financial_facts is append-only; net/outstanding/overpaid are always DERIVED.
 */

export type SellableRow = Database["public"]["Tables"]["sellables"]["Row"];
export type PriceRow = Database["public"]["Tables"]["prices"]["Row"];
export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type ReservationRow = Database["public"]["Tables"]["commercial_reservations"]["Row"];
export type FinancialFactRow = Database["public"]["Tables"]["financial_facts"]["Row"];

export type SellableKind = Database["public"]["Enums"]["sellable_kind"];
export type SellableStatus = Database["public"]["Enums"]["sellable_status"];
export type PriceBasis = Database["public"]["Enums"]["price_basis"];
export type PriceStatus = Database["public"]["Enums"]["price_status"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type ReservationStatus = Database["public"]["Enums"]["commercial_reservation_status"];
export type FinancialFactType = Database["public"]["Enums"]["financial_fact_type"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export const SELLABLE_KINDS: SellableKind[] = [
  "offering",
  "merchandise",
  "ticket",
  "service",
  "fee_item",
];

export const PRICE_BASES: PriceBasis[] = ["per_person", "per_unit", "flat"];

export const ORDER_STATUSES: OrderStatus[] = [
  "draft",
  "submitted",
  "confirmed",
  "cancelled",
  "completed",
];

/** Provider-neutral, manually verified payment evidence. No gateway exists in W09. */
export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "bank_transfer", "other"];

/** Server-controlled reservation TTL (informational mirror of the backend contract). */
export const RESERVATION_TTL_MINUTES = 30;

export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  draft: "bg-elevated text-muted-foreground",
  submitted: "bg-warning-soft text-warning",
  confirmed: "bg-success-soft text-success",
  cancelled: "bg-destructive/10 text-destructive",
  completed: "bg-primary/10 text-primary",
};

export const RESERVATION_TONE: Record<string, string> = {
  reserved: "bg-warning-soft text-warning",
  confirmed: "bg-success-soft text-success",
  released: "bg-elevated text-muted-foreground",
  expired: "bg-destructive/10 text-destructive",
};

export const FACT_TONE: Record<FinancialFactType, string> = {
  PAYMENT_RECORDED: "bg-success-soft text-success",
  PAYMENT_REVERSED: "bg-destructive/10 text-destructive",
  REFUND_RECORDED: "bg-warning-soft text-warning",
};

/** Derived financial state — mirrors app_private.w09_order_financial_state exactly. */
export type OrderFinancialState = {
  currency: string;
  grand_total_minor: number;
  gross_recorded_payments_minor: number;
  reversed_payments_minor: number;
  valid_paid_minor: number;
  refunded_minor: number;
  net_paid_minor: number;
  outstanding_minor: number;
  overpaid_minor: number;
};

export type CatalogPrice = {
  id: string;
  currency: string;
  unit_amount_minor: number;
  price_basis: PriceBasis;
  status: PriceStatus;
  description: string | null;
  valid_from: string;
  valid_until: string | null;
  is_current: boolean;
};

export type CatalogEntry = {
  id: string;
  sellable_kind: SellableKind;
  status: SellableStatus;
  offering_id: string | null;
  label: string;
  description: string | null;
  offering_status: string | null;
  offering_capacity: number | null;
  prices: CatalogPrice[];
};

export type OrderListRow = {
  id: string;
  status: OrderStatus;
  currency: string;
  buyer_person_id: string;
  buyer_name: string | null;
  operation_id: string | null;
  reference_label: string | null;
  grand_total_minor: number | null;
  item_count: number;
  financial: OrderFinancialState;
  created_at: string;
};

export type OrderDetailItem = {
  id: string;
  sellable_id: string;
  price_id: string;
  offering_id: string | null;
  sellable_kind: SellableKind;
  name: string;
  description: string | null;
  price_basis: PriceBasis;
  currency: string;
  unit_amount_minor: number;
  quantity: number;
  discount_minor: number;
  line_subtotal_minor: number;
  line_total_minor: number;
  beneficiary_person_id: string | null;
  beneficiary_name: string | null;
  snapshot_taken_at: string;
};

export type OrderDetailReservation = {
  id: string;
  order_item_id: string;
  offering_id: string;
  quantity: number;
  status: ReservationStatus;
  effective_state: string;
  consumes_capacity: boolean;
  expires_at: string | null;
  confirmed_at: string | null;
  released_at: string | null;
  released_reason: string | null;
  expired_at: string | null;
  reacquired_from_reservation_id: string | null;
};

export type OrderDetailFact = {
  id: string;
  fact_type: FinancialFactType;
  amount_minor: number;
  currency: string;
  method: PaymentMethod | null;
  reference: string | null;
  reason: string;
  references_fact_id: string | null;
  occurred_at: string;
  recorded_at: string;
  is_reversed: boolean;
  refunded_minor: number;
};

export type OrderDetail = {
  order: {
    id: string;
    tenant_id: string;
    operation_id: string | null;
    buyer_person_id: string;
    buyer_name: string | null;
    currency: string;
    status: OrderStatus;
    reference_label: string | null;
    notes: string | null;
    subtotal_minor: number | null;
    discount_total_minor: number | null;
    grand_total_minor: number | null;
    submitted_at: string | null;
    confirmed_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    completed_at: string | null;
    created_at: string;
  };
  items: OrderDetailItem[];
  reservations: OrderDetailReservation[];
  facts: OrderDetailFact[];
  financial: OrderFinancialState;
  draft_totals: {
    subtotal_minor: number;
    discount_total_minor: number;
    grand_total_minor: number;
  } | null;
};

/** Order items are editable ONLY while the order is a draft. */
export function isDraft(status: OrderStatus) {
  return status === "draft";
}

/** Terminal orders never accept new money. */
export function acceptsNewPayment(status: OrderStatus) {
  return status === "submitted" || status === "confirmed" || status === "completed";
}

/** A payment is refundable while it is not reversed and has remaining balance. */
export function refundableMinor(fact: OrderDetailFact) {
  if (fact.fact_type !== "PAYMENT_RECORDED" || fact.is_reversed) return 0;
  return Math.max(fact.amount_minor - fact.refunded_minor, 0);
}

/** Reversal is full amount, once, and only when nothing was refunded against it. */
export function canReverse(fact: OrderDetailFact) {
  return (
    fact.fact_type === "PAYMENT_RECORDED" && !fact.is_reversed && fact.refunded_minor === 0
  );
}

/** Decimal input → BIGINT minor units. Never store or compute money as a float. */
export function toMinorUnits(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ""] = normalized.split(".");
  const cents = (frac + "00").slice(0, 2);
  return Number(whole) * 100 + Number(cents);
}

export function fromMinorUnits(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

/** Drops undefined keys so optional RPC arguments stay absent, not explicit undefined. */
export function rpcArgs<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
