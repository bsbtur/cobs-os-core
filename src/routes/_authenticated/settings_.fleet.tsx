import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, IdCard } from "lucide-react";

import { AppShell } from "@/app/shell/app-shell";
import { RequireTenant } from "@/app/shell/require-tenant";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import {
  VEHICLE_KINDS,
  newIdempotencyKey,
  type DriverRow,
  type VehicleKind,
  type VehicleRow,
} from "@/lib/w05";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";

/** Drops undefined keys so optional RPC arguments stay absent rather than explicit undefined. */
function rpcArgs<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}

export const Route = createFileRoute("/_authenticated/settings_/fleet")({
  head: () => ({
    meta: [
      { title: "Fleet — vehicles and drivers in COBS OS" },
      {
        name: "description",
        content:
          "Reusable transport resources for your organization. A driver always points at an existing person record.",
      },
      { property: "og:title", content: "Fleet — vehicles and drivers in COBS OS" },
      {
        property: "og:description",
        content: "Vehicles and drivers as reusable resources, never as a second identity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FleetPage,
});

const SELECT_CLASS =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type DriverWithPerson = DriverRow & { people: { full_name: string } | null };

function VehicleForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [label, setLabel] = React.useState("");
  const [kind, setKind] = React.useState<VehicleKind>("bus");
  const [identifier, setIdentifier] = React.useState("");
  const [capacity, setCapacity] = React.useState("");
  const [operator, setOperator] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "create_vehicle",
        rpcArgs({
          _tenant_id: tenantId,
          _label: label,
          _idempotency_key: newIdempotencyKey() as string,
          _vehicle_kind: kind,
          _identifier: identifier || undefined,
          _capacity: capacity ? Number(capacity) : undefined,
          _operator_name: operator || undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w05.fleet.saved"));
      setLabel("");
      setIdentifier("");
      setCapacity("");
      setOperator("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="vehicle-label">{t("w05.fleet.label")}</Label>
        <Input id="vehicle-label" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vehicle-kind">{t("w05.leg.kind")}</Label>
        <select
          id="vehicle-kind"
          className={SELECT_CLASS}
          value={kind}
          onChange={(e) => setKind(e.target.value as VehicleKind)}
        >
          {VEHICLE_KINDS.map((value) => (
            <option key={value} value={value}>
              {t(`w05.vehicleKind.${value}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vehicle-identifier">{t("w05.fleet.identifier")}</Label>
        <Input
          id="vehicle-identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vehicle-capacity">{t("w05.fleet.capacity")}</Label>
        <Input
          id="vehicle-capacity"
          type="number"
          inputMode="numeric"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="vehicle-operator">{t("w05.fleet.operator")}</Label>
        <Input id="vehicle-operator" value={operator} onChange={(e) => setOperator(e.target.value)} />
      </div>
      <Button
        className="min-h-11 sm:col-span-2"
        disabled={create.isPending || label.trim() === ""}
        onClick={() => create.mutate()}
      >
        {t("w05.fleet.addVehicle")}
      </Button>
    </div>
  );
}

function DriverForm({
  tenantId,
  people,
  onDone,
}: {
  tenantId: string;
  people: Array<{ id: string; full_name: string }>;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [personId, setPersonId] = React.useState("");
  const [operator, setOperator] = React.useState("");
  const [code, setCode] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "create_driver",
        rpcArgs({
          _tenant_id: tenantId,
          _person_id: personId,
          _idempotency_key: newIdempotencyKey() as string,
          _operator_name: operator || undefined,
          _driver_code: code || undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w05.fleet.saved"));
      setPersonId("");
      setOperator("");
      setCode("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (people.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">{t("w05.fleet.noPeople")}</p>;
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="driver-person">{t("w05.fleet.person")}</Label>
        <select
          id="driver-person"
          className={SELECT_CLASS}
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
        >
          <option value="">—</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="driver-code">{t("w05.fleet.driverCode")}</Label>
        <Input id="driver-code" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="driver-operator">{t("w05.fleet.operator")}</Label>
        <Input id="driver-operator" value={operator} onChange={(e) => setOperator(e.target.value)} />
      </div>
      <Button
        className="min-h-11 sm:col-span-2"
        disabled={create.isPending || personId === ""}
        onClick={() => create.mutate()}
      >
        {t("w05.fleet.addDriver")}
      </Button>
    </div>
  );
}

function Body() {
  const { t, locale } = useI18n();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const data = useQuery({
    queryKey: ["fleet", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const [vehicles, drivers, people] = await Promise.all([
        supabase.from("vehicles").select("*").eq("tenant_id", tenant!.id).order("label"),
        supabase
          .from("drivers")
          .select("*, people(full_name)")
          .eq("tenant_id", tenant!.id),
        supabase
          .from("people")
          .select("id, full_name")
          .eq("tenant_id", tenant!.id)
          .order("full_name"),
      ]);
      if (vehicles.error) throw vehicles.error;
      return {
        vehicles: (vehicles.data ?? []) as VehicleRow[],
        drivers: (drivers.data ?? []) as unknown as DriverWithPerson[],
        people: (people.data ?? []) as Array<{ id: string; full_name: string }>,
      };
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["fleet", tenant?.id] });
  };

  const toggle = useMutation({
    mutationFn: async (input: { kind: "vehicle" | "driver"; id: string; active: boolean }) => {
      const { error } =
        input.kind === "vehicle"
          ? await supabase.rpc("set_vehicle_active", {
              _vehicle_id: input.id,
              _is_active: input.active,
            })
          : await supabase.rpc("set_driver_active", {
              _driver_id: input.id,
              _is_active: input.active,
            });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w05.fleet.saved"));
      refresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (data.isLoading) return <PanelSkeleton />;

  const vehicles = data.data?.vehicles ?? [];
  const drivers = data.data?.drivers ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-semibold">{t("w05.fleet.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("w05.fleet.subtitle")}</p>
      </header>

      <section className="surface-panel p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Bus className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold">{t("w05.fleet.vehicles")}</h3>
        </div>
        {vehicles.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("w05.fleet.noVehicles")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-medium">{vehicle.label}</span>
                <span className="text-muted-foreground">
                  {t(`w05.vehicleKind.${vehicle.vehicle_kind}`)}
                  {vehicle.identifier ? ` · ${vehicle.identifier}` : ""}
                  {vehicle.capacity ? ` · ${vehicle.capacity}` : ""}
                </span>
                {!vehicle.is_active ? (
                  <span className="rounded bg-elevated px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t("w05.fleet.retired")}
                  </span>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto min-h-9"
                  disabled={toggle.isPending}
                  onClick={() =>
                    toggle.mutate({ kind: "vehicle", id: vehicle.id, active: !vehicle.is_active })
                  }
                >
                  {vehicle.is_active ? t("w05.fleet.retire") : t("w05.fleet.restore")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {tenant ? <VehicleForm tenantId={tenant.id} onDone={refresh} /> : null}
      </section>

      <section className="surface-panel p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <IdCard className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold">{t("w05.fleet.drivers")}</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("w05.fleet.contactHelp")}</p>
        {drivers.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("w05.fleet.noDrivers")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {drivers.map((driver) => (
              <li key={driver.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-medium">{driver.people?.full_name ?? "—"}</span>
                <span className="text-muted-foreground">
                  {driver.driver_code ? `· ${driver.driver_code}` : ""}
                  {driver.operator_name ? ` · ${driver.operator_name}` : ""}
                </span>
                {!driver.is_active ? (
                  <span className="rounded bg-elevated px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t("w05.fleet.retired")}
                  </span>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto min-h-9"
                  disabled={toggle.isPending}
                  onClick={() =>
                    toggle.mutate({ kind: "driver", id: driver.id, active: !driver.is_active })
                  }
                >
                  {driver.is_active ? t("w05.fleet.retire") : t("w05.fleet.restore")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {tenant ? (
          <DriverForm tenantId={tenant.id} people={data.data?.people ?? []} onDone={refresh} />
        ) : null}
      </section>
    </div>
  );
}

function FleetPage() {
  const { t } = useI18n();
  return (
    <AppShell activeId="settings" title={t("w05.fleet.title")}>
      <div className="mx-auto w-full max-w-4xl">
        <RequireTenant>
          <Body />
        </RequireTenant>
      </div>
    </AppShell>
  );
}
