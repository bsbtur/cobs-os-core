import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, ShoppingBag } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  ORDER_STATUSES,
  ORDER_STATUS_TONE,
  newIdempotencyKey,
  rpcArgs,
  type OrderListRow,
  type OrderStatus,
} from "@/lib/w09";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * COBS OS · W09 — Commerce workspace (orders).
 * ORDER != PAYMENT. COBS records manually verified money; it never processes it.
 */
export const Route = createFileRoute("/_authenticated/commerce/")({
  head: () => ({
    meta: [
      { title: "Commerce — orders and manual payment records in COBS OS" },
      {
        name: "description",
        content:
          "Catalog, orders, commercial reservations and manually verified payment records. COBS never processes money.",
      },
      { property: "og:title", content: "Commerce — orders and manual payment records in COBS OS" },
      {
        property: "og:description",
        content: "Provider-neutral commerce: orders, reservations and an append-only ledger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommercePage,
});

type PersonOption = { id: string; full_name: string };
type OperationOption = { id: string; name: string };

function NewOrderForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [buyer, setBuyer] = React.useState("");
  const [currency, setCurrency] = React.useState("BRL");
  const [operationId, setOperationId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const people = useQuery({
    queryKey: ["w09", "people", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id, full_name")
        .eq("tenant_id", tenantId)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as PersonOption[];
    },
  });

  const operations = useQuery({
    queryKey: ["w09", "operations", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operations")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as OperationOption[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "create_order",
        rpcArgs({
          _tenant_id: tenantId,
          _buyer_person_id: buyer,
          _currency: currency.toUpperCase(),
          _operation_id: operationId || undefined,
          _reference_label: reference || undefined,
          _notes: notes || undefined,
          _idempotency_key: newIdempotencyKey(),
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.order.created"));
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="order-buyer">{t("w09.order.buyer")}</Label>
        <select
          id="order-buyer"
          required
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={buyer}
          onChange={(e) => setBuyer(e.target.value)}
        >
          <option value="">—</option>
          {(people.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t("w09.order.buyerHint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="order-currency">{t("w09.order.currency")}</Label>
        <Input
          id="order-currency"
          maxLength={3}
          required
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="order-operation">{t("w09.order.operation")}</Label>
        <select
          id="order-operation"
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={operationId}
          onChange={(e) => setOperationId(e.target.value)}
        >
          <option value="">{t("w09.order.operationNone")}</option>
          {(operations.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="order-ref">{t("w09.order.reference")}</Label>
        <Input id="order-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="order-notes">{t("w09.order.notes")}</Label>
        <Textarea id="order-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="min-h-11" disabled={create.isPending || !buyer}>
          {create.isPending ? t("common.saving") : t("w09.order.create")}
        </Button>
      </div>
    </form>
  );
}

function CommerceWorkspace() {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<OrderStatus | "">("");
  const [open, setOpen] = React.useState(false);

  const tenantId = tenant!.id;

  const orders = useQuery({
    queryKey: ["w09", "orders", tenantId, status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "list_orders",
        rpcArgs({ _tenant_id: tenantId, _status: status || undefined }),
      );
      if (error) throw error;
      return (data ?? []) as unknown as OrderListRow[];
    },
  });

  if (orders.isLoading) return <PanelSkeleton />;
  if (orders.isError) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title={t("w09.forbidden")}
        body={humanizeError(orders.error, locale) || t("w09.forbiddenBody")}
      />
    );
  }

  const rows = orders.data ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("w09.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("w09.subtitle")}</p>
        <p className="text-xs text-muted-foreground">{t("w09.boundary")}</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="order-filter">{t("w09.orders.filter")}</Label>
          <select
            id="order-filter"
            className="h-11 rounded-md border border-border bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus | "")}
          >
            <option value="">{t("w09.orders.all")}</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`w09.status.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <Button className="min-h-11" onClick={() => setOpen(true)}>
          <Plus className="mr-2 size-4" aria-hidden />
          {t("w09.orders.new")}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/settings/catalog">{t("w09.catalog.title")}</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t("w09.orders.empty")}
          body={t("w09.orders.emptyBody")}
        />
      ) : (
        <ul className="grid gap-3">
          {rows.map((o) => (
            <li key={o.id}>
              <Link
                to="/commerce/$orderId"
                params={{ orderId: o.id }}
                className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-elevated"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {o.buyer_name ?? t("w09.order")}
                      {o.reference_label ? ` · ${o.reference_label}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {o.item_count} {t("w09.orders.items")} ·{" "}
                      {formatDateTime(o.created_at, { locale })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums">
                      {formatMoney(o.grand_total_minor ?? 0, {
                        locale,
                        currency: o.currency,
                      })}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_TONE[o.status]}`}
                    >
                      {t(`w09.status.${o.status}`)}
                    </span>
                  </div>
                </div>
                {o.financial.outstanding_minor > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("w09.financial.outstanding")}:{" "}
                    {formatMoney(o.financial.outstanding_minor, {
                      locale,
                      currency: o.currency,
                    })}
                  </p>
                )}
                {o.financial.overpaid_minor > 0 && (
                  <p className="mt-2 text-xs text-warning">
                    {t("w09.financial.overpaid")}:{" "}
                    {formatMoney(o.financial.overpaid_minor, { locale, currency: o.currency })}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("w09.orders.new")}</DialogTitle>
          </DialogHeader>
          <NewOrderForm
            tenantId={tenantId}
            onDone={() => {
              setOpen(false);
              void queryClient.invalidateQueries({ queryKey: ["w09", "orders"] });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CommercePage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="commerce" title={t("w09.title")}>
      <RequireTenant>
        <CommerceWorkspace />
      </RequireTenant>
    </AppShell>
  );
}
