import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, Plus } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import {
  PROPERTY_KINDS,
  newIdempotencyKey,
  type PropertyKind,
  type PropertyRow,
} from "@/lib/w06";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";

/** Drops undefined keys so optional RPC arguments stay absent rather than explicit undefined. */
function rpcArgs<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}

export const Route = createFileRoute("/_authenticated/settings_/properties")({
  head: () => ({
    meta: [
      { title: "Properties — accommodation catalog in COBS OS" },
      {
        name: "description",
        content:
          "Reusable hotels, guesthouses and venues for your organization. No rates, contracts or channel integrations.",
      },
      { property: "og:title", content: "Properties — accommodation catalog in COBS OS" },
      {
        property: "og:description",
        content: "A property is a reusable place. A stay is what an operation actually books.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropertiesPage,
});

const SELECT_CLASS =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function PropertyForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<PropertyKind>("hotel");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [contact, setContact] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "create_hospitality_property",
        rpcArgs({
          _tenant_id: tenantId,
          _name: name,
          _idempotency_key: newIdempotencyKey(),
          _property_kind: kind,
          _city: city || undefined,
          _region: region || undefined,
          _country_code: country ? country.toUpperCase() : undefined,
          _contact_label: contact || undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w06.prop.saved"));
      setName("");
      setCity("");
      setRegion("");
      setContact("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="prop-name">{t("w06.prop.name")}</Label>
        <Input id="prop-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="prop-kind">{t("w06.prop.kind")}</Label>
        <select
          id="prop-kind"
          className={SELECT_CLASS}
          value={kind}
          onChange={(e) => setKind(e.target.value as PropertyKind)}
        >
          {PROPERTY_KINDS.map((value) => (
            <option key={value} value={value}>
              {t(`w06.kind.${value}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="prop-city">{t("w06.prop.city")}</Label>
        <Input id="prop-city" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="prop-region">{t("w06.prop.region")}</Label>
        <Input id="prop-region" value={region} onChange={(e) => setRegion(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="prop-country">{t("w06.prop.country")}</Label>
        <Input
          id="prop-country"
          maxLength={2}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="prop-contact">{t("w06.prop.contact")}</Label>
        <Input id="prop-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Button
          className="min-h-11"
          disabled={create.isPending || name.trim() === ""}
          onClick={() => create.mutate()}
        >
          <Plus className="mr-2 size-4" aria-hidden="true" />
          {t("w06.prop.add")}
        </Button>
      </div>
    </div>
  );
}

function PropertiesPage() {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const properties = useQuery({
    queryKey: ["hospitality-properties", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitality_properties")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as PropertyRow[];
    },
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["hospitality-properties"] });

  const toggle = useMutation({
    mutationFn: async (row: PropertyRow) => {
      const { error } = await supabase.rpc(
        "set_hospitality_property_active",
        rpcArgs({
          _property_id: row.id,
          _is_active: !row.is_active,
          _idempotency_key: newIdempotencyKey(),
          _reason: row.is_active ? t("w06.prop.archive") : t("w06.prop.restore"),
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w06.prop.saved"));
      refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const rows = properties.data ?? [];

  return (
    <AppShell activeId="settings" title={t("w06.prop.title")}>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <RequireTenant>
          <section className="surface-panel animate-rise p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BedDouble className="size-4 text-primary" aria-hidden="true" />
              {t("w06.prop.title")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("w06.prop.subtitle")}</p>

            {properties.isLoading ? (
              <PanelSkeleton rows={3} />
            ) : rows.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={BedDouble}
                  title={t("w06.prop.empty")}
                  body={t("w06.prop.emptyBody")}
                />
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border/70">
                {rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`w06.kind.${row.property_kind}`)}
                        {[row.city, row.region, row.country_code].filter(Boolean).length > 0
                          ? ` · ${[row.city, row.region, row.country_code].filter(Boolean).join(" · ")}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        row.is_active
                          ? "bg-success-soft text-success"
                          : "bg-elevated text-muted-foreground"
                      }`}
                    >
                      {row.is_active ? t("w06.prop.active") : t("w06.prop.archived")}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-11"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate(row)}
                    >
                      {row.is_active ? t("w06.prop.archive") : t("w06.prop.restore")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {tenant ? <PropertyForm tenantId={tenant.id} onDone={refresh} /> : null}
          </section>
        </RequireTenant>
      </div>
    </AppShell>
  );
}
