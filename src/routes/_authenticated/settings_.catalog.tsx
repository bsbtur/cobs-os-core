import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Tags } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  PRICE_BASES,
  SELLABLE_KINDS,
  rpcArgs,
  toMinorUnits,
  type CatalogEntry,
  type PriceBasis,
  type SellableKind,
} from "@/lib/w09";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * COBS OS · W09 — commercial catalog.
 * SELLABLE != OFFERING != PRICE. Capacity always belongs to the offering (W02);
 * a price window is commercial terms only and is frozen into an item when used.
 */
export const Route = createFileRoute("/_authenticated/settings_/catalog")({
  head: () => ({
    meta: [
      { title: "Commercial catalog — sellables and price windows in COBS OS" },
      {
        name: "description",
        content:
          "Sellable items and non-overlapping price windows. Prices used in orders stay frozen on the order item.",
      },
      { property: "og:title", content: "Commercial catalog — sellables and price windows" },
      {
        property: "og:description",
        content: "Define what your organization sells and the commercial terms that apply.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CatalogPage,
});

function SellableForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [kind, setKind] = React.useState<SellableKind>("offering");
  const [offeringId, setOfferingId] = React.useState("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  const offerings = useQuery({
    queryKey: ["w09", "offerings", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "create_sellable",
        rpcArgs({
          _tenant_id: tenantId,
          _sellable_kind: kind,
          _offering_id: kind === "offering" ? offeringId || undefined : undefined,
          _name: name || undefined,
          _description: description || undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.catalog.created"));
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
      <div className="space-y-1.5">
        <Label htmlFor="sellable-kind">{t("w09.catalog.kind")}</Label>
        <select
          id="sellable-kind"
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value as SellableKind)}
        >
          {SELLABLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`w09.kind.${k}`)}
            </option>
          ))}
        </select>
      </div>
      {kind === "offering" && (
        <div className="space-y-1.5">
          <Label htmlFor="sellable-offering">{t("w09.catalog.offering")}</Label>
          <select
            id="sellable-offering"
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={offeringId}
            onChange={(e) => setOfferingId(e.target.value)}
          >
            <option value="">{t("w09.catalog.offeringNone")}</option>
            {(offerings.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="sellable-name">{t("w09.catalog.name")}</Label>
        <Input id="sellable-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="sellable-desc">{t("w09.catalog.description")}</Label>
        <Input
          id="sellable-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="min-h-11" disabled={create.isPending}>
          {create.isPending ? t("common.saving") : t("w09.catalog.create")}
        </Button>
      </div>
    </form>
  );
}

function PriceForm({ sellableId, onDone }: { sellableId: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [currency, setCurrency] = React.useState("BRL");
  const [amount, setAmount] = React.useState("");
  const [basis, setBasis] = React.useState<PriceBasis>("per_person");
  const [from, setFrom] = React.useState("");
  const [until, setUntil] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const minor = toMinorUnits(amount);
      if (minor === null) throw new Error("Invalid amount");
      const { error } = await supabase.rpc(
        "create_price",
        rpcArgs({
          _sellable_id: sellableId,
          _currency: currency.toUpperCase(),
          _unit_amount_minor: minor,
          _price_basis: basis,
          _valid_from: from ? new Date(from).toISOString() : undefined,
          _valid_until: until ? new Date(until).toISOString() : undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.prices.created"));
      setAmount("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <form
      className="mt-3 grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`price-amount-${sellableId}`}>{t("w09.prices.amount")}</Label>
        <Input
          id={`price-amount-${sellableId}`}
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`price-currency-${sellableId}`}>{t("w09.order.currency")}</Label>
        <Input
          id={`price-currency-${sellableId}`}
          maxLength={3}
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`price-basis-${sellableId}`}>{t("w09.prices.basis")}</Label>
        <select
          id={`price-basis-${sellableId}`}
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={basis}
          onChange={(e) => setBasis(e.target.value as PriceBasis)}
        >
          {PRICE_BASES.map((b) => (
            <option key={b} value={b}>
              {t(`w09.basis.${b}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`price-from-${sellableId}`}>{t("w09.prices.from")}</Label>
        <Input
          id={`price-from-${sellableId}`}
          type="datetime-local"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`price-until-${sellableId}`}>{t("w09.prices.until")}</Label>
        <Input
          id={`price-until-${sellableId}`}
          type="datetime-local"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" variant="outline" className="min-h-11" disabled={create.isPending}>
          {create.isPending ? t("common.saving") : t("w09.prices.add")}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">{t("w09.prices.hint")}</p>
      </div>
    </form>
  );
}

function CatalogWorkspace() {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const tenantId = tenant!.id;

  const catalog = useQuery({
    queryKey: ["w09", "catalog", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_commerce_catalog", { _tenant_id: tenantId });
      if (error) throw error;
      return (data ?? []) as unknown as CatalogEntry[];
    },
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["w09"] });

  const activateSellable = useMutation({
    mutationFn: async (entry: CatalogEntry) => {
      if (entry.offering_id && entry.offering_status !== "active") {
        const { error } = await (supabase.rpc as any)("activate_offering", {
          _offering_id: entry.offering_id,
        });
        if (error) throw error;
      }
      const { error } = await (supabase.rpc as any)("activate_sellable", {
        _sellable_id: entry.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Item comercial ativado.");
      refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const activatePrice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.rpc as any)("activate_price", { _price_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Preço ativado.");
      refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const archiveSellable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("archive_sellable", { _sellable_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.catalog.archived"));
      refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const archivePrice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("archive_price", { _price_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w09.prices.archived"));
      refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (catalog.isLoading) return <PanelSkeleton />;
  if (catalog.isError) {
    return (
      <EmptyState
        icon={Tags}
        title={t("w09.forbidden")}
        body={humanizeError(catalog.error, locale) || t("w09.forbiddenBody")}
      />
    );
  }

  const entries = catalog.data ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("w09.catalog.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("w09.catalog.subtitle")}</p>
      </header>

      <Button className="min-h-11" onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" aria-hidden />
        {t("w09.catalog.new")}
      </Button>

      {entries.length === 0 ? (
        <EmptyState icon={Tags} title={t("w09.catalog.empty")} body={t("w09.catalog.emptyBody")} />
      ) : (
        <ul className="grid gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{entry.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`w09.kind.${entry.sellable_kind}`)}
                    {entry.offering_capacity != null
                      ? ` · ${t("w09.catalog.capacity")}: ${entry.offering_capacity}`
                      : ""}
                    {entry.status === "archived" ? " · —" : ""}
                  </p>
                </div>
                {entry.status === "active" ? (
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    disabled={archiveSellable.isPending}
                    onClick={() => archiveSellable.mutate(entry.id)}
                  >
                    {t("w09.catalog.archive")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={activateSellable.isPending}
                    onClick={() => activateSellable.mutate(entry)}
                  >
                    {entry.offering_id && entry.offering_status !== "active"
                      ? "Ativar oferta e item"
                      : "Ativar item"}
                  </Button>
                )}
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <h3 className="text-sm font-semibold">{t("w09.prices")}</h3>
                {entry.prices.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t("w09.prices.empty")}</p>
                ) : (
                  <ul className="mt-2 grid gap-2">
                    {entry.prices.map((price) => (
                      <li
                        key={price.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-elevated px-3 py-2 text-sm"
                      >
                        <span className="tabular-nums">
                          {formatMoney(price.unit_amount_minor, {
                            locale,
                            currency: price.currency,
                          })}{" "}
                          · {t(`w09.basis.${price.price_basis}`)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(price.valid_from, { locale })} →{" "}
                          {price.valid_until
                            ? formatDateTime(price.valid_until, { locale })
                            : t("w09.prices.open")}
                          {price.is_current ? ` · ${t("w09.prices.current")}` : ""}
                        </span>
                        {price.status === "active" ? (
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            disabled={archivePrice.isPending}
                            onClick={() => archivePrice.mutate(price.id)}
                          >
                            {t("w09.prices.archive")}
                          </Button>
                        ) : entry.status === "active" ? (
                          <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={activatePrice.isPending}
                            onClick={() => activatePrice.mutate(price.id)}
                          >
                            Ativar preço
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {entry.status === "active" && <PriceForm sellableId={entry.id} onDone={refresh} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("w09.catalog.new")}</DialogTitle>
          </DialogHeader>
          <SellableForm
            tenantId={tenantId}
            onDone={() => {
              setOpen(false);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatalogPage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="commerce" title={t("w09.catalog.title")}>
      <RequireTenant>
        <CatalogWorkspace />
      </RequireTenant>
    </AppShell>
  );
}