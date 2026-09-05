import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Banknote, Lock, Ticket } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  FACT_TONE,
  ORDER_STATUS_TONE,
  PAYMENT_METHODS,
  RESERVATION_TONE,
  acceptsNewPayment,
  canReverse,
  isDraft,
  newIdempotencyKey,
  refundableMinor,
  rpcArgs,
  toMinorUnits,
  type CatalogEntry,
  type OrderDetail,
  type OrderDetailFact,
  type PaymentMethod,
} from "@/lib/w09";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";

/**
 * COBS OS · W09 — Order detail.
 * Items are DRAFT-ONLY. Reservations are capacity, never participation.
 * Financial values are DERIVED from an append-only fact stream; nothing is editable.
 */
export const Route = createFileRoute("/_authenticated/commerce/$orderId")({
  validateSearch: (search: Record<string, unknown>): { environment: "production" | "qa" } => ({
    environment: search["environment"] === "qa" ? "qa" : "production",
  }),
  head: () => ({
    meta: [
      { title: "Order detail — items, holds and verified payments in COBS OS" },
      {
        name: "description",
        content:
          "Order items with frozen price snapshots, commercial reservations and an append-only record of manually verified payments.",
      },
      { property: "og:title", content: "Order detail — items, holds and verified payments" },
      {
        property: "og:description",
        content: "Draft-only items, capacity holds and derived financial state.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderDetailPage,
});

function Money({ minor, currency }: { minor: number; currency: string }) {
  const { locale } = useI18n();
  return <span className="tabular-nums">{formatMoney(minor, { locale, currency })}</span>;
}

function AddItemForm({
  tenantId,
  orderId,
  onDone,
}: {
  tenantId: string;
  orderId: string;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [sellableId, setSellableId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [discount, setDiscount] = React.useState("0");
  const [beneficiary, setBeneficiary] = React.useState("");

  const catalog = useQuery({
    queryKey: ["w09", "catalog", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_commerce_catalog", {
        _tenant_id: tenantId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CatalogEntry[];
    },
  });

  const people = useQuery({
    queryKey: ["w09", "people", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id, full_name")
        .eq("tenant_id", tenantId)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const discountMinor = toMinorUnits(discount || "0");
      if (discountMinor === null) throw new Error("Invalid discount");
      const { error } = await supabase.rpc(
        "add_order_item",
        rpcArgs({
          _order_id: orderId,
          _sellable_id: sellableId,
          _quantity: Number(quantity),
          _discount_minor: discountMinor,
          _beneficiary_person_id: beneficiary || undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.order.saved"));
      setSellableId("");
      setQuantity("1");
      setDiscount("0");
      setBeneficiary("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const active = (catalog.data ?? []).filter((c) => c.status === "active");

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="item-sellable">{t("w09.items.sellable")}</Label>
        <select
          id="item-sellable"
          required
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={sellableId}
          onChange={(e) => setSellableId(e.target.value)}
        >
          <option value="">—</option>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} · {t(`w09.kind.${c.sellable_kind}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="item-qty">{t("w09.items.quantity")}</Label>
        <Input
          id="item-qty"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="item-discount">{t("w09.items.discount")}</Label>
        <Input
          id="item-discount"
          inputMode="decimal"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="item-beneficiary">{t("w09.items.beneficiary")}</Label>
        <select
          id="item-beneficiary"
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={beneficiary}
          onChange={(e) => setBeneficiary(e.target.value)}
        >
          <option value="">{t("w09.items.beneficiaryNone")}</option>
          {(people.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t("w09.items.beneficiaryHint")}</p>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="min-h-11" disabled={add.isPending || !sellableId}>
          {add.isPending ? t("common.saving") : t("w09.items.add")}
        </Button>
      </div>
    </form>
  );
}

function PaymentForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = React.useState("");
  const [reason, setReason] = React.useState("");

  const record = useMutation({
    mutationFn: async () => {
      const minor = toMinorUnits(amount);
      if (minor === null || minor <= 0) throw new Error("Invalid amount");
      const { error } = await supabase.rpc(
        "record_payment",
        rpcArgs({
          _order_id: orderId,
          _amount_minor: minor,
          _method: method,
          _reference: reference,
          _reason: reason,
          _idempotency_key: newIdempotencyKey(),
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.payment.saved"));
      setAmount("");
      setReference("");
      setReason("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        record.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="pay-amount">{t("w09.payment.amount")}</Label>
        <Input
          id="pay-amount"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pay-method">{t("w09.payment.method")}</Label>
        <select
          id="pay-method"
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`w09.method.${m}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pay-ref">{t("w09.payment.reference")}</Label>
        <Input
          id="pay-ref"
          required
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pay-reason">{t("w09.payment.reason")}</Label>
        <Input
          id="pay-reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <p className="mb-2 text-xs text-muted-foreground">{t("w09.payment.recordHint")}</p>
        <Button type="submit" className="min-h-11" disabled={record.isPending}>
          <Banknote className="mr-2 size-4" aria-hidden />
          {record.isPending ? t("common.saving") : t("w09.payment.record")}
        </Button>
      </div>
    </form>
  );
}

function FactRow({ fact, onDone }: { fact: OrderDetailFact; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [refundAmount, setRefundAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const available = refundableMinor(fact);

  const refund = useMutation({
    mutationFn: async () => {
      const minor = toMinorUnits(refundAmount);
      if (minor === null || minor <= 0) throw new Error("Invalid amount");
      const { error } = await supabase.rpc(
        "record_refund",
        rpcArgs({
          _payment_fact_id: fact.id,
          _amount_minor: minor,
          _reason: reason || "refund",
          _reference: fact.reference ?? "—",
          _idempotency_key: newIdempotencyKey(),
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.payment.saved"));
      setRefundAmount("");
      setReason("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const reverse = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "reverse_payment",
        rpcArgs({
          _payment_fact_id: fact.id,
          _reason: reason || "reversal",
          _reference: fact.reference ?? "—",
          _idempotency_key: newIdempotencyKey(),
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.payment.saved"));
      setReason("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${FACT_TONE[fact.fact_type]}`}
        >
          {t(`w09.fact.${fact.fact_type}`)}
        </span>
        <Money minor={fact.amount_minor} currency={fact.currency} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatDateTime(fact.occurred_at, { locale })}
        {fact.method ? ` · ${t(`w09.method.${fact.method}`)}` : ""}
        {fact.reference ? ` · ${fact.reference}` : ""}
      </p>
      <p className="mt-1 text-sm">{fact.reason}</p>

      {fact.fact_type === "PAYMENT_RECORDED" && (available > 0 || canReverse(fact)) && (
        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${fact.id}`}>{t("w09.payment.reason")}</Label>
            <Input
              id={`reason-${fact.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {available > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor={`refund-${fact.id}`}>
                {t("w09.refund.available")} <Money minor={available} currency={fact.currency} />
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`refund-${fact.id}`}
                  inputMode="decimal"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shrink-0"
                  disabled={refund.isPending || !refundAmount}
                  onClick={() => refund.mutate()}
                >
                  {t("w09.refund")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("w09.refund.hint")}</p>
            </div>
          )}
          {canReverse(fact) && (
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={reverse.isPending}
                onClick={() => reverse.mutate()}
              >
                {t("w09.reverse")}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">{t("w09.reverse.hint")}</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function OrderWorkspace({
  orderId,
  environment,
}: {
  orderId: string;
  environment: "production" | "qa";
}) {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = React.useState("");

  const detail = useQuery({
    queryKey: ["w09", "order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_order_detail", { _order_id: orderId });
      if (error) throw error;
      return data as unknown as OrderDetail;
    },
  });

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["w09"] });
  }, [queryClient]);

  const lifecycle = useMutation({
    mutationFn: async (action: "submit" | "confirm" | "complete" | "cancel") => {
      if (action === "cancel") {
        const { error } = await supabase.rpc("cancel_order", {
          _order_id: orderId,
          _reason: cancelReason || "cancelled",
          _idempotency_key: newIdempotencyKey(),
        });
        if (error) throw error;
        return;
      }
      const fn =
        action === "submit"
          ? "submit_order"
          : action === "confirm"
            ? "confirm_order"
            : "complete_order";
      const { error } = await supabase.rpc(fn, {
        _order_id: orderId,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.lifecycle.done"));
      setCancelReason("");
      refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc("remove_order_item", { _order_item_id: itemId });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const releaseHold = useMutation({
    mutationFn: async (reservationId: string) => {
      const { error } = await supabase.rpc("release_commercial_reservation", {
        _reservation_id: reservationId,
        _reason: "released by operator",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.reservations.released"));
      refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (detail.isLoading) return <PanelSkeleton />;
  if (detail.isError || !detail.data) {
    return (
      <EmptyState
        icon={Ticket}
        title={t("w09.order.notFound")}
        body={detail.error ? humanizeError(detail.error, locale) : t("w09.forbiddenBody")}
      />
    );
  }

  const { order, items, reservations, facts, financial, draft_totals } = detail.data;
  const currency = order.currency;
  const draft = isDraft(order.status);
  const totals = draft_totals ?? {
    subtotal_minor: order.subtotal_minor ?? 0,
    discount_total_minor: order.discount_total_minor ?? 0,
    grand_total_minor: order.grand_total_minor ?? 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" className="min-h-11 px-2">
          <Link to="/commerce" search={{ environment }}>
            <ArrowLeft className="mr-2 size-4" aria-hidden />
            {t("w09.order.back")}
          </Link>
        </Button>
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {order.buyer_name ?? t("w09.order")}
          </h1>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_TONE[order.status]}`}
          >
            {t(`w09.status.${order.status}`)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {order.reference_label ? `${order.reference_label} · ` : ""}
          {t("w09.order.created_at")}: {formatDateTime(order.created_at, { locale })}
        </p>
        {order.cancellation_reason && (
          <p className="text-sm text-destructive">{order.cancellation_reason}</p>
        )}
      </header>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("w09.lifecycle")}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {order.status === "draft" && (
            <Button
              className="min-h-11"
              disabled={lifecycle.isPending || items.length === 0}
              onClick={() => lifecycle.mutate("submit")}
            >
              {t("w09.lifecycle.submit")}
            </Button>
          )}
          {order.status === "submitted" && (
            <Button
              className="min-h-11"
              disabled={lifecycle.isPending}
              onClick={() => lifecycle.mutate("confirm")}
            >
              {t("w09.lifecycle.confirm")}
            </Button>
          )}
          {order.status === "confirmed" && (
            <Button
              className="min-h-11"
              disabled={lifecycle.isPending}
              onClick={() => lifecycle.mutate("complete")}
            >
              {t("w09.lifecycle.complete")}
            </Button>
          )}
          {(order.status === "draft" ||
            order.status === "submitted" ||
            order.status === "confirmed") && (
            <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
              <div className="space-y-1.5">
                <Label htmlFor="cancel-reason">{t("w09.lifecycle.cancelReason")}</Label>
                <Input
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={lifecycle.isPending || !cancelReason.trim()}
                onClick={() => lifecycle.mutate("cancel")}
              >
                {t("w09.lifecycle.cancel")}
              </Button>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("w09.lifecycle.submitHint")}</p>
        <p className="text-xs text-muted-foreground">{t("w09.lifecycle.cancelHint")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("w09.items")}</h2>
        {items.length === 0 ? (
          <EmptyState icon={Ticket} title={t("w09.items.empty")} body={t("w09.items.emptyBody")} />
        ) : (
          <ul className="grid gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × <Money minor={item.unit_amount_minor} currency={currency} />
                    {item.discount_minor > 0 && (
                      <>
                        {" − "}
                        <Money minor={item.discount_minor} currency={currency} />
                      </>
                    )}
                    {" · "}
                    {t("w09.items.snapshot")} {formatDateTime(item.snapshot_taken_at, { locale })}
                  </p>
                  {item.beneficiary_name && (
                    <p className="text-xs text-muted-foreground">{item.beneficiary_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Money minor={item.line_total_minor} currency={currency} />
                  {draft && (
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      disabled={removeItem.isPending}
                      onClick={() => removeItem.mutate(item.id)}
                    >
                      {t("w09.items.remove")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {draft ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <AddItemForm tenantId={tenant!.id} orderId={orderId} onDone={refresh} />
          </div>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden />
            {t("w09.items.lockedHint")}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("w09.totals")}
        </h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">{t("w09.totals.subtotal")}</dt>
            <dd>
              <Money minor={totals.subtotal_minor} currency={currency} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("w09.totals.discount")}</dt>
            <dd>
              <Money minor={totals.discount_total_minor} currency={currency} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("w09.totals.grand")}</dt>
            <dd className="font-semibold">
              <Money minor={totals.grand_total_minor} currency={currency} />
            </dd>
          </div>
        </dl>
        {draft && <p className="mt-2 text-xs text-muted-foreground">{t("w09.totals.draftHint")}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("w09.reservations")}</h2>
        <p className="text-xs text-muted-foreground">{t("w09.reservations.ttl")}</p>
        {reservations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("w09.reservations.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {reservations.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      RESERVATION_TONE[r.effective_state] ?? RESERVATION_TONE["released"]
                    }`}
                  >
                    {r.effective_state}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.quantity} ·{" "}
                    {r.consumes_capacity
                      ? t("w09.reservations.consuming")
                      : t("w09.reservations.notConsuming")}
                    {r.expires_at
                      ? ` · ${t("w09.reservations.expires")} ${formatDateTime(r.expires_at, { locale })}`
                      : ""}
                  </p>
                </div>
                {r.status === "reserved" ? (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={releaseHold.isPending}
                    onClick={() => releaseHold.mutate(r.id)}
                  >
                    {t("w09.reservations.release")}
                  </Button>
                ) : r.status === "confirmed" ? (
                  <p className="text-xs text-muted-foreground">
                    {t("w09.reservations.confirmedLocked")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("w09.financial")}
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          {(
            [
              ["w09.financial.gross", financial.gross_recorded_payments_minor],
              ["w09.financial.reversed", financial.reversed_payments_minor],
              ["w09.financial.validPaid", financial.valid_paid_minor],
              ["w09.financial.refunded", financial.refunded_minor],
              ["w09.financial.net", financial.net_paid_minor],
              ["w09.financial.outstanding", financial.outstanding_minor],
            ] as const
          ).map(([key, value]) => (
            <div key={key}>
              <dt className="text-muted-foreground">{t(key)}</dt>
              <dd>
                <Money minor={value} currency={currency} />
              </dd>
            </div>
          ))}
        </dl>
        {financial.overpaid_minor > 0 && (
          <div className="mt-3 rounded-md bg-warning-soft p-3">
            <p className="text-sm font-medium text-warning">
              {t("w09.financial.overpaid")}:{" "}
              <Money minor={financial.overpaid_minor} currency={currency} />
            </p>
            <p className="text-xs text-warning">{t("w09.financial.overpaidHint")}</p>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t("w09.financial.derivedHint")}</p>
      </section>

      {acceptsNewPayment(order.status) ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("w09.payment.record")}
          </h2>
          <div className="mt-3">
            <PaymentForm orderId={orderId} onDone={refresh} />
          </div>
        </section>
      ) : (
        order.status === "cancelled" && (
          <p className="text-sm text-muted-foreground">{t("w09.payment.blocked")}</p>
        )
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("w09.ledger")}</h2>
        <p className="text-xs text-muted-foreground">{t("w09.ledger.appendOnly")}</p>
        {facts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("w09.ledger.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {facts.map((f) => (
              <FactRow key={f.id} fact={f} onDone={refresh} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrderDetailPage() {
  const { t } = useI18n();
  const { orderId } = Route.useParams();
  const { environment } = Route.useSearch();
  return (
    <AppShell activeId="commerce" title={t("w09.order")}>
      <RequireTenant>
        <OrderWorkspace orderId={orderId} environment={environment} />
      </RequireTenant>
    </AppShell>
  );
}
