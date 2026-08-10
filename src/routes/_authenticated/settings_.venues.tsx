import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { newIdempotencyKey, rpcArgs, type VenueRow, type VenueSpaceRow } from "@/lib/w07";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * COBS OS · W07 — venue catalog.
 * VENUE != SPACE · VENUE != EVENT. A venue is a reusable place owned by the
 * tenant; nothing here knows about a specific event.
 */
export const Route = createFileRoute("/_authenticated/settings_/venues")({
  head: () => ({
    meta: [
      { title: "Venues — event location catalog in COBS OS" },
      {
        name: "description",
        content:
          "Reusable venues and their spaces for event production. A venue is a place; an event is what happens there.",
      },
      { property: "og:title", content: "Venues — event location catalog in COBS OS" },
      {
        property: "og:description",
        content: "Reusable venues and spaces for your organization's event production.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VenuesPage,
});

function VenueForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [contact, setContact] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "create_venue",
        rpcArgs({
          _tenant_id: tenantId,
          _name: name,
          _idempotency_key: newIdempotencyKey(),
          _city: city || undefined,
          _region: region || undefined,
          _country_code: country ? country.toUpperCase() : undefined,
          _address_label: address || undefined,
          _contact_label: contact || undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.venues.saved"));
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
        <Label htmlFor="venue-name">{t("w07.venues.name")}</Label>
        <Input id="venue-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="venue-city">{t("w07.venues.city")}</Label>
        <Input id="venue-city" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="venue-region">{t("w07.venues.region")}</Label>
        <Input id="venue-region" value={region} onChange={(e) => setRegion(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="venue-country">{t("w07.venues.country")}</Label>
        <Input
          id="venue-country"
          maxLength={2}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="venue-contact">{t("w07.venues.contact")}</Label>
        <Input id="venue-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="venue-address">{t("w07.venues.address")}</Label>
        <Input id="venue-address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="min-h-11" disabled={create.isPending || !name.trim()}>
          {create.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function SpaceForm({ venueId, onDone }: { venueId: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [name, setName] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [capacity, setCapacity] = React.useState("");
  const [floor, setFloor] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "create_venue_space",
        rpcArgs({
          _venue_id: venueId,
          _name: name,
          _idempotency_key: newIdempotencyKey(),
          _space_label: label || undefined,
          _planning_capacity: capacity ? Number(capacity) : undefined,
          _floor_label: floor || undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.spaces.saved"));
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
        <Label htmlFor="space-name">{t("w07.spaces.name")}</Label>
        <Input id="space-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="space-label">{t("w07.spaces.label")}</Label>
        <Input id="space-label" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="space-capacity">{t("w07.spaces.capacity")}</Label>
        <Input
          id="space-capacity"
          type="number"
          min={0}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("w07.spaces.capacityHint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="space-floor">{t("w07.spaces.floor")}</Label>
        <Input id="space-floor" value={floor} onChange={(e) => setFloor(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="min-h-11" disabled={create.isPending || !name.trim()}>
          {create.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function VenueCard({ venue }: { venue: VenueRow }) {
  const { t, locale } = useI18n();
  const { canManage } = useTenant();
  const queryClient = useQueryClient();
  const [addingSpace, setAddingSpace] = React.useState(false);

  const spaces = useQuery({
    queryKey: ["venue-spaces", venue.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_spaces")
        .select("*")
        .eq("venue_id", venue.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as VenueSpaceRow[];
    },
  });

  const setActive = useMutation({
    mutationFn: async (isActive: boolean) => {
      const { error } = await supabase.rpc("update_venue", {
        _venue_id: venue.id,
        _idempotency_key: newIdempotencyKey(),
        _is_active: isActive,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w07.venues.saved"));
      void queryClient.invalidateQueries({ queryKey: ["venues", venue.tenant_id] });
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <section className="surface-panel space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{venue.name}</h3>
        {!venue.is_active ? (
          <span className="rounded bg-elevated px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {t("w07.venues.inactive")}
          </span>
        ) : null}
        {canManage ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto min-h-9"
            disabled={setActive.isPending}
            onClick={() => setActive.mutate(!venue.is_active)}
          >
            {venue.is_active ? t("w07.venues.deactivate") : t("w07.venues.activate")}
          </Button>
        ) : null}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {[venue.city, venue.region, venue.country_code].filter(Boolean).join(" · ") ||
          t("common.none")}
      </p>

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("w07.spaces.title")}</p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-9"
            onClick={() => setAddingSpace((v) => !v)}
          >
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            {t("w07.spaces.add")}
          </Button>
        </div>

        {addingSpace ? (
          <SpaceForm
            venueId={venue.id}
            onDone={() => {
              setAddingSpace(false);
              void spaces.refetch();
            }}
          />
        ) : null}

        {spaces.data && spaces.data.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {spaces.data.map((space) => (
              <li
                key={space.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-elevated/50 px-3 py-2 text-sm"
              >
                <span className="font-medium">{space.name}</span>
                {space.space_label ? (
                  <span className="text-muted-foreground">{space.space_label}</span>
                ) : null}
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {space.planning_capacity ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("w07.spaces.empty")}</p>
        )}
      </div>
    </section>
  );
}

function VenuesPage() {
  const { t } = useI18n();
  const { tenant, canManage } = useTenant();
  const [creating, setCreating] = React.useState(false);
  const queryClient = useQueryClient();

  const venues = useQuery({
    queryKey: ["venues", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as VenueRow[];
    },
  });

  return (
    <AppShell activeId="settings" title={t("w07.venues.title")}>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <RequireTenant>
          <header className="surface-panel animate-rise space-y-2 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold">{t("w07.venues.title")}</h2>
              {canManage ? (
                <Button className="ml-auto min-h-11" onClick={() => setCreating(true)}>
                  <Plus className="mr-2 size-4" aria-hidden="true" />
                  {t("w07.venues.new")}
                </Button>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{t("w07.venues.subtitle")}</p>
          </header>

          {venues.isLoading ? <PanelSkeleton rows={3} /> : null}

          {venues.data && venues.data.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={t("w07.venues.empty")}
              body={t("w07.venues.emptyBody")}
            />
          ) : null}

          <div className="space-y-4">
            {(venues.data ?? []).map((venue) => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>

          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("w07.venues.new")}</DialogTitle>
              </DialogHeader>
              {tenant ? (
                <VenueForm
                  tenantId={tenant.id}
                  onDone={() => {
                    setCreating(false);
                    void queryClient.invalidateQueries({ queryKey: ["venues", tenant.id] });
                  }}
                />
              ) : null}
            </DialogContent>
          </Dialog>
        </RequireTenant>
      </div>
    </AppShell>
  );
}
