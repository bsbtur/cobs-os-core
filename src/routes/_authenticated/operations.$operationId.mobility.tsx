import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, Clock, MapPin, Plus, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { isOperationClosed, ReadOnlyNotice } from "@/lib/operation-lock";
import {
  DISPATCH_TONE,
  LEG_KINDS,
  dispatchLabel,
  newIdempotencyKey,
  transportEventLabel,
  type DriverRow,
  type LegDispatchState,
  type LegKind,
  type LegManifest,
  type OperationMobility,
  type SeatCandidates,
  type TransportEventRow,
  type TransportLegRow,
  type VehicleRow,
} from "@/lib/w05";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/operations/$operationId/mobility")({
  head: () => ({
    meta: [
      { title: "Mobility — COBS OS transport legs and dispatch" },
      {
        name: "description",
        content:
          "Plan and dispatch transport legs: vehicles, drivers, stops, seats and recorded movement facts.",
      },
      { property: "og:title", content: "Mobility — COBS OS transport legs and dispatch" },
      {
        property: "og:description",
        content: "Dispatch is derived from recorded facts. Journey still owns presence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MobilityPage,
});

/** Drops undefined keys so optional RPC arguments stay absent rather than explicit undefined. */
function rpcArgs<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}

const SELECT_CLASS =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

type DriverWithPerson = DriverRow & { people: { full_name: string } | null };

/**
 * A leg is TERMINAL once it arrived or was cancelled: no mutation control may stay
 * enabled. Further facts belong to a new ad-hoc leg, never to a closed one.
 */
function isTerminalLeg(state: LegDispatchState | null) {
  return Boolean(state?.actual_arrival || state?.cancelled_at);
}

/* ------------------------------------------------------------------ */
/* Leg creation                                                        */
/* ------------------------------------------------------------------ */

function CreateLegDialog({
  operationId,
  adHoc,
  steps,
  onDone,
}: {
  operationId: string;
  adHoc: boolean;
  steps: Array<{ id: string; title: string }>;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<LegKind>("transfer");
  const [origin, setOrigin] = React.useState("");
  const [destination, setDestination] = React.useState("");
  const [departure, setDeparture] = React.useState("");
  const [arrival, setArrival] = React.useState("");
  const [stepId, setStepId] = React.useState("");
  const [reason, setReason] = React.useState("");

  const iso = (value: string) => (value ? new Date(value).toISOString() : undefined);

  const create = useMutation({
    mutationFn: async () => {
      const shared = {
        _operation_id: operationId,
        _title: title,
        _idempotency_key: newIdempotencyKey() as string,
        _leg_kind: kind,
        _origin_label: origin || undefined,
        _destination_label: destination || undefined,
        _journey_step_id: stepId || undefined,
      };
      const { error } = adHoc
        ? await supabase.rpc(
            "create_ad_hoc_transport_leg",
            rpcArgs({
              ...shared,
              _reason: reason,
              _expected_departure: iso(departure),
              _expected_arrival: iso(arrival),
            }),
          )
        : await supabase.rpc(
            "create_transport_leg",
            rpcArgs({
              ...shared,
              _planned_departure: iso(departure),
              _planned_arrival: iso(arrival),
            }),
          );
      if (error) throw error;
    },

    onSuccess: () => {
      feedback.success(t("w05.leg.saved"));
      setOpen(false);
      setTitle("");
      setReason("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <>
      <Button
        className="min-h-11"
        variant={adHoc ? "outline" : "default"}
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-2 size-4" aria-hidden="true" />
        {adHoc ? t("w05.leg.addAdHoc") : t("w05.leg.add")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{adHoc ? t("w05.leg.addAdHoc") : t("w05.leg.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="leg-title">{t("w05.leg.title")}</Label>
              <Input id="leg-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            {adHoc ? (
              <div className="space-y-1.5">
                <Label htmlFor="leg-reason">{t("w05.leg.reason")}</Label>
                <Textarea
                  id="leg-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="leg-kind">{t("w05.leg.kind")}</Label>
              <select
                id="leg-kind"
                className={SELECT_CLASS}
                value={kind}
                onChange={(e) => setKind(e.target.value as LegKind)}
              >
                {LEG_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`w05.kind.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="leg-origin">{t("w05.leg.origin")}</Label>
                <Input id="leg-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leg-destination">{t("w05.leg.destination")}</Label>
                <Input
                  id="leg-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leg-departure">
                  {adHoc ? t("w05.leg.expectedDeparture") : t("w05.leg.plannedDeparture")}
                </Label>
                <Input
                  id="leg-departure"
                  type="datetime-local"
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leg-arrival">
                  {adHoc ? t("w05.leg.expectedArrival") : t("w05.leg.plannedArrival")}
                </Label>
                <Input
                  id="leg-arrival"
                  type="datetime-local"
                  value={arrival}
                  onChange={(e) => setArrival(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leg-step">{t("w05.leg.journeyStep")}</Label>
              <select
                id="leg-step"
                className={SELECT_CLASS}
                value={stepId}
                onChange={(e) => setStepId(e.target.value)}
              >
                <option value="">{t("w05.leg.journeyStepNone")}</option>
                {steps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.title}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="min-h-11 w-full"
              disabled={create.isPending || title.trim() === "" || (adHoc && reason.trim() === "")}
              onClick={() => create.mutate()}
            >
              {t("w05.leg.saved")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Assignment + dispatch                                               */
/* ------------------------------------------------------------------ */

function AssignmentPanel({
  leg,
  state,
  vehicles,
  drivers,
  onRefresh,
}: {
  leg: TransportLegRow;
  state: LegDispatchState | null;
  vehicles: VehicleRow[];
  drivers: DriverWithPerson[];
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const [reason, setReason] = React.useState("");
  const terminal = isTerminalLeg(state);
  const departed = Boolean(state?.actual_departure) || terminal;

  const call = useMutation({
    mutationFn: async (payload: { fn: "vehicle" | "driver" | "clear"; id?: string }) => {
      if (payload.fn === "vehicle") {
        const { error } = await supabase.rpc(
          "assign_vehicle_to_leg",
          rpcArgs({
            _transport_leg_id: leg.id,
            _vehicle_id: payload.id!,
            _reason: reason || undefined,
          }),
        );
        if (error) throw error;
      } else if (payload.fn === "driver") {
        const { error } = await supabase.rpc(
          "assign_driver_to_leg",
          rpcArgs({
            _transport_leg_id: leg.id,
            _driver_id: payload.id!,
            _reason: reason || undefined,
          }),
        );
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("clear_leg_assignment", {
          _transport_leg_id: leg.id,
          _reason: reason,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      feedback.success(t("w05.action.recorded"));
      setReason("");
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  if (departed) {
    return (
      <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted-foreground">
        {terminal ? t("w05.leg.terminalLock") : t("w05.leg.departedLock")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="assign-vehicle">{t("w05.action.assignVehicle")}</Label>
          <select
            id="assign-vehicle"
            className={SELECT_CLASS}
            value={leg.vehicle_id ?? ""}
            onChange={(e) => call.mutate({ fn: "vehicle", id: e.target.value })}
          >
            <option value="">—</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.label}
                {vehicle.capacity ? ` · ${vehicle.capacity}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assign-driver">{t("w05.action.assignDriver")}</Label>
          <select
            id="assign-driver"
            className={SELECT_CLASS}
            value={leg.driver_id ?? ""}
            onChange={(e) => call.mutate({ fn: "driver", id: e.target.value })}
          >
            <option value="">—</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.people?.full_name ?? "—"}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="assign-reason">{t("w05.leg.reason")}</Label>
        <Input id="assign-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {leg.vehicle_id || leg.driver_id ? (
        <Button
          variant="outline"
          className="min-h-11"
          disabled={call.isPending || reason.trim() === ""}
          onClick={() => call.mutate({ fn: "clear" })}
        >
          {t("w05.action.clearAssignment")}
        </Button>
      ) : null}
    </div>
  );
}

function DispatchActions({
  leg,
  state,
  onRefresh,
}: {
  leg: TransportLegRow;
  state: LegDispatchState | null;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();

  const call = useMutation({
    mutationFn: async (fn: string) => {
      const { error } = await supabase.rpc(
        fn as
          | "request_vehicle"
          | "record_vehicle_en_route_to_pickup"
          | "record_vehicle_at_pickup"
          | "record_leg_departed"
          | "record_destination_arrived",
        { _transport_leg_id: leg.id },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w05.action.recorded"));
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  /* TERMINAL LEG: arrived or cancelled legs expose no enabled dispatch control. */
  const terminal = isTerminalLeg(state);

  const actions: Array<{ fn: string; label: string; disabled: boolean }> = [
    {
      fn: "request_vehicle",
      label: t("w05.action.requestVehicle"),
      disabled: terminal || Boolean(state?.requested_at),
    },
    {
      fn: "record_vehicle_en_route_to_pickup",
      label: t("w05.action.enRoute"),
      disabled: terminal || Boolean(state?.en_route_at) || !leg.vehicle_id,
    },
    {
      fn: "record_vehicle_at_pickup",
      label: t("w05.action.atPickup"),
      disabled: terminal || Boolean(state?.at_pickup_at) || !leg.vehicle_id,
    },
    {
      fn: "record_leg_departed",
      label: t("w05.action.departed"),
      disabled:
        terminal ||
        Boolean(state?.actual_departure) ||
        !state?.at_pickup_at ||
        !leg.vehicle_id ||
        !leg.driver_id,
    },
    {
      fn: "record_destination_arrived",
      label: t("w05.action.arrived"),
      disabled: terminal || Boolean(state?.actual_arrival) || !state?.actual_departure,
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.fn}
          className="min-h-12 flex-1 sm:flex-none"
          variant="outline"
          disabled={call.isPending || action.disabled}
          onClick={() => call.mutate(action.fn)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stops + seats                                                       */
/* ------------------------------------------------------------------ */

function StopsPanel({
  leg,
  manifest,
  state,
  timeZone,
  onRefresh,
}: {
  leg: TransportLegRow;
  manifest: LegManifest | null;
  state: LegDispatchState | null;
  timeZone: string;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const [label, setLabel] = React.useState("");
  const [isPickup, setIsPickup] = React.useState(false);

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_transport_leg_stop", {
        _transport_leg_id: leg.id,
        _label: label,
        _is_pickup: isPickup,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w05.action.recorded"));
      setLabel("");
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const reach = useMutation({
    mutationFn: async (stopId: string) => {
      const { error } = await supabase.rpc("record_stop_reached", {
        _transport_leg_stop_id: stopId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w05.action.recorded"));
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const stops = manifest?.stops ?? [];
  const terminal = isTerminalLeg(state);

  return (
    <section className="surface-panel p-4">
      <div className="flex items-center gap-2">
        <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
        <SectionLabel>{t("w05.stops.title")}</SectionLabel>
      </div>
      {stops.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("w05.stops.empty")}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {stops.map((stop) => (
            <li key={stop.transport_leg_stop_id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{stop.label}</span>
              {stop.is_pickup ? (
                <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[11px] text-primary">
                  {t("w05.stops.pickup")}
                </span>
              ) : null}
              {stop.reached_at ? (
                <span className="font-mono text-xs tabular-nums text-success">
                  {t("w05.stops.reached")} ·{" "}
                  {formatDateTime(stop.reached_at, { locale, timeZone })}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-9"
                  disabled={reach.isPending || terminal}
                  onClick={() => reach.mutate(stop.transport_leg_stop_id)}
                >
                  {t("w05.action.stopReached")}
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="stop-label">{t("w05.stops.label")}</Label>
          <Input
            id="stop-label"
            value={label}
            disabled={terminal}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox
            checked={isPickup}
            disabled={terminal}
            onCheckedChange={(value) => setIsPickup(value === true)}
            aria-label={t("w05.stops.pickup")}
          />
          {t("w05.stops.pickup")}
        </label>
        <Button
          className="min-h-11"
          variant="outline"
          disabled={add.isPending || terminal || label.trim() === ""}
          onClick={() => add.mutate()}
        >
          {t("w05.stops.add")}
        </Button>
      </div>
    </section>
  );
}

function SeatsPanel({
  leg,
  manifest,
  candidates,
  state,
  timeZone,
  onRefresh,
}: {
  leg: TransportLegRow;
  manifest: LegManifest | null;
  candidates: SeatCandidates | null;
  state: LegDispatchState | null;
  timeZone: string;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const [participationId, setParticipationId] = React.useState("");
  const [seatLabel, setSeatLabel] = React.useState("");
  const [releaseReason, setReleaseReason] = React.useState("");
  const [confirmUnnumberedOpen, setConfirmUnnumberedOpen] = React.useState(false);

  const trimmedLabel = seatLabel.trim();

  const assign = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "assign_seat",
        rpcArgs({
          _transport_leg_id: leg.id,
          _participation_id: participationId,
          _idempotency_key: newIdempotencyKey() as string,
          // DEF-PILOT-013: blank labels become unnumbered seats only after
          // explicit operator confirmation; backend contract is preserved.
          _seat_label: trimmedLabel || undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w05.action.recorded"));
      setParticipationId("");
      setSeatLabel("");
      setConfirmUnnumberedOpen(false);
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const attemptAssign = () => {
    if (trimmedLabel === "") {
      setConfirmUnnumberedOpen(true);
      return;
    }
    assign.mutate();
  };

  const release = useMutation({
    mutationFn: async (seatAssignmentId: string) => {
      const { error } = await supabase.rpc("release_seat", {
        _seat_assignment_id: seatAssignmentId,
        _reason: releaseReason || "Released by operations",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w05.seats.released"));
      setReleaseReason("");
      onRefresh();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const seated = manifest?.seated ?? [];
  const history = manifest?.released_history ?? [];
  const options = candidates?.candidates ?? [];
  const departed = Boolean(state?.actual_departure) || isTerminalLeg(state);

  return (
    <section className="surface-panel p-4">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        <SectionLabel>{t("w05.seats.title")}</SectionLabel>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
          {state?.seats_taken ?? seated.length}
          {state?.capacity ? `/${state.capacity}` : ""} {t("w05.seats.taken")}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("w05.seats.eligibilityHelp")}</p>

      {seated.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("w05.seats.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {seated.map((row) => (
            <li key={row.seat_assignment_id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{row.full_name}</span>
              <span className="text-muted-foreground">
                {row.seat_label ? `· ${row.seat_label}` : ""}
              </span>
              {!row.still_eligible ? (
                <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] text-warning">
                  {t("w05.seats.ineligible")}
                </span>
              ) : null}
              {!departed ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto min-h-9"
                  disabled={release.isPending}
                  onClick={() => release.mutate(row.seat_assignment_id)}
                >
                  {t("w05.seats.release")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!departed ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="seat-person">{t("w05.seats.candidates")}</Label>
            <select
              id="seat-person"
              className={SELECT_CLASS}
              value={participationId}
              onChange={(e) => setParticipationId(e.target.value)}
            >
              <option value="">—</option>
              {options.map((row) => (
                <option key={row.participation_id} value={row.participation_id}>
                  {row.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32 space-y-1.5">
            <Label htmlFor="seat-label">{t("w05.seats.label")}</Label>
            <Input id="seat-label" value={seatLabel} onChange={(e) => setSeatLabel(e.target.value)} />
          </div>
          <Button
            className="min-h-11"
            variant="outline"
            disabled={assign.isPending || participationId === ""}
            onClick={attemptAssign}
          >
            {t("w05.seats.assign")}
          </Button>
        </div>
      ) : null}

      <Dialog open={confirmUnnumberedOpen} onOpenChange={setConfirmUnnumberedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("w05.seats.confirmUnnumberedTitle")}</DialogTitle>
            <DialogDescription>{t("w05.seats.confirmUnnumberedBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUnnumberedOpen(false)}>
              {t("w05.seats.confirmUnnumberedCancel")}
            </Button>
            <Button
              variant="default"
              disabled={assign.isPending}
              onClick={() => {
                assign.mutate();
              }}
            >
              {t("w05.seats.confirmUnnumberedConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {history.length > 0 ? (
        <div className="mt-5">
          <SectionLabel>{t("w05.seats.history")}</SectionLabel>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {history.map((row) => (
              <li key={row.seat_assignment_id} className="flex flex-wrap gap-2">
                <span className="font-mono text-xs tabular-nums">
                  {formatDateTime(row.released_at, { locale, timeZone })}
                </span>
                <span>
                  {row.full_name}
                  {row.seat_label ? ` · ${row.seat_label}` : ""}
                </span>
                {row.release_reason ? <span>— {row.release_reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Forecast, return time and incidents                                 */
/* ------------------------------------------------------------------ */

function LegControls({
  leg,
  state,
  onRefresh,
}: {
  leg: TransportLegRow;
  state: LegDispatchState | null;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const [forecastDeparture, setForecastDeparture] = React.useState("");
  const [forecastArrival, setForecastArrival] = React.useState("");
  const [forecastReason, setForecastReason] = React.useState("");
  const [returnTime, setReturnTime] = React.useState("");
  const [returnReason, setReturnReason] = React.useState("");
  const [incident, setIncident] = React.useState("");

  /* TERMINAL LEG: arrived or cancelled — every control below is locked. */
  const terminal = isTerminalLeg(state);
  /* DEF-002: changing an agreed rendezvous requires a reason (server enforces it too). */
  const returnReasonRequired = Boolean(state?.return_time);


  const iso = (value: string) => (value ? new Date(value).toISOString() : undefined);
  const done = () => {
    feedback.success(t("w05.action.recorded"));
    onRefresh();
  };
  const fail = (error: unknown) => feedback.error(humanizeError(error, locale));

  const forecast = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "set_transport_leg_expected_window",
        rpcArgs({
          _transport_leg_id: leg.id,
          _reason: forecastReason,
          _expected_departure: iso(forecastDeparture),
          _expected_arrival: iso(forecastArrival),
        }),
      );
      if (error) throw error;
    },
    onSuccess: done,
    onError: fail,
  });

  const rendezvous = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(
        "set_return_time",
        rpcArgs({
          _transport_leg_id: leg.id,
          _return_time: new Date(returnTime).toISOString(),
          _note: returnReason.trim() === "" ? undefined : returnReason.trim(),
        }),
      );
      if (error) throw error;
      return data as unknown as { unchanged?: boolean } | null;
    },
    onSuccess: (result) => {
      /* DEF-003: an identical rendezvous is a no-op — say so instead of faking a new fact. */
      if (result?.unchanged) {
        feedback.info(t("w05.leg.returnTimeUnchanged"));
        return;
      }
      setReturnReason("");
      done();
    },
    onError: fail,
  });

  const note = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("note_transport_incident", {
        _transport_leg_id: leg.id,
        _note: incident,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setIncident("");
      done();
    },
    onError: fail,
  });

  if (terminal) {
    return (
      <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted-foreground">
        {t("w05.leg.terminalLock")}
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <SectionLabel>{t("w05.action.setForecast")}</SectionLabel>
        <Input
          type="datetime-local"
          aria-label={t("w05.leg.expectedDeparture")}
          value={forecastDeparture}
          onChange={(e) => setForecastDeparture(e.target.value)}
        />
        <Input
          type="datetime-local"
          aria-label={t("w05.leg.expectedArrival")}
          value={forecastArrival}
          onChange={(e) => setForecastArrival(e.target.value)}
        />
        <Input
          aria-label={t("w05.leg.reason")}
          placeholder={t("w05.leg.reason")}
          value={forecastReason}
          onChange={(e) => setForecastReason(e.target.value)}
        />
        <Button
          variant="outline"
          className="min-h-11 w-full"
          disabled={
            forecast.isPending ||
            forecastReason.trim() === "" ||
            (forecastDeparture === "" && forecastArrival === "")
          }
          onClick={() => forecast.mutate()}
        >
          {t("w05.action.setForecast")}
        </Button>
      </div>

      <div className="space-y-2">
        <SectionLabel>{t("w05.leg.returnTime")}</SectionLabel>
        <p className="text-xs text-muted-foreground">{t("w05.leg.returnTimeHelp")}</p>
        <Input
          type="datetime-local"
          aria-label={t("w05.leg.returnTime")}
          value={returnTime}
          onChange={(e) => setReturnTime(e.target.value)}
        />
        {returnReasonRequired ? (
          <>
            <Input
              aria-label={t("w05.leg.returnTimeReason")}
              placeholder={t("w05.leg.returnTimeReason")}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("w05.leg.returnTimeReasonHelp")}</p>
          </>
        ) : null}
        <Button
          variant="outline"
          className="min-h-11 w-full"
          disabled={
            rendezvous.isPending ||
            returnTime === "" ||
            (returnReasonRequired && returnReason.trim() === "")
          }
          onClick={() => rendezvous.mutate()}
        >
          {t("w05.action.setReturnTime")}
        </Button>


        <SectionLabel>{t("w05.action.incident")}</SectionLabel>
        <Textarea
          aria-label={t("w05.action.incident")}
          value={incident}
          onChange={(e) => setIncident(e.target.value)}
        />
        <Button
          variant="outline"
          className="min-h-11 w-full"
          disabled={note.isPending || incident.trim() === ""}
          onClick={() => note.mutate()}
        >
          {t("w05.action.incident")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function MobilityPage() {
  const { operationId } = useParams({ from: "/_authenticated/operations/$operationId/mobility" });
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const data = useQuery({
    queryKey: ["mobility", operationId],
    queryFn: async () => {
      const [operation, legs, vehicles, drivers, steps, events, overview] = await Promise.all([
        supabase.from("operations").select("*").eq("id", operationId).maybeSingle(),
        supabase.from("transport_legs").select("*").eq("operation_id", operationId).order("sequence"),
        supabase.from("vehicles").select("*").eq("is_active", true).order("label"),
        supabase.from("drivers").select("*, people(full_name)").eq("is_active", true),
        supabase.from("journey_steps").select("id, title").eq("operation_id", operationId).order("sequence"),
        supabase
          .from("transport_events")
          .select("*")
          .eq("operation_id", operationId)
          .order("occurred_at", { ascending: false })
          .limit(40),
        supabase.rpc("w05_operation_mobility", { _operation_id: operationId }),
      ]);
      if (operation.error) throw operation.error;
      if (legs.error) throw legs.error;
      return {
        operation: operation.data,
        legs: (legs.data ?? []) as TransportLegRow[],
        vehicles: (vehicles.data ?? []) as VehicleRow[],
        drivers: (drivers.data ?? []) as unknown as DriverWithPerson[],
        steps: (steps.data ?? []) as Array<{ id: string; title: string }>,
        events: (events.data ?? []) as TransportEventRow[],
        overview: (overview.data ?? null) as unknown as OperationMobility | null,
      };
    },
  });

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["mobility", operationId] });
    void queryClient.invalidateQueries({ queryKey: ["mobility-leg"] });
  }, [operationId, queryClient]);

  /* REALTIME: operation-scoped and RLS-gated. Only transport_events and transport_legs publish. */
  React.useEffect(() => {
    const channel = supabase
      .channel(`mobility-${operationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transport_events",
          filter: `operation_id=eq.${operationId}`,
        },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transport_legs",
          filter: `operation_id=eq.${operationId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [operationId, refresh]);

  const legs = data.data?.legs ?? [];
  const selected = legs.find((leg) => leg.id === selectedId) ?? legs[0] ?? null;

  const detail = useQuery({
    queryKey: ["mobility-leg", selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: async () => {
      const [state, manifest, candidates, legEvents] = await Promise.all([
        supabase.rpc("w05_leg_dispatch_state", { _transport_leg_id: selected!.id }),
        supabase.rpc("w05_leg_manifest", { _transport_leg_id: selected!.id }),
        supabase.rpc("w05_leg_seat_candidates", { _transport_leg_id: selected!.id }),
        supabase
          .from("transport_events")
          .select("*")
          .eq("transport_leg_id", selected!.id)
          .order("occurred_at", { ascending: false })
          .limit(60),
      ]);
      return {
        state: (state.data ?? null) as unknown as LegDispatchState | null,
        manifest: (manifest.data ?? null) as unknown as LegManifest | null,
        candidates: (candidates.data ?? null) as unknown as SeatCandidates | null,
        legEvents: (legEvents.data ?? []) as TransportEventRow[],
      };
    },
  });

  if (data.isLoading) return <PanelSkeleton />;

  const operation = data.data?.operation;
  if (!operation) {
    return <EmptyState icon={Bus} title={t("w05.forbidden")} body={t("w05.forbiddenBody")} />;
  }

  const timeZone = operation.timezone;
  const planning = operation.status === "draft" || operation.status === "planning";
  const operationClosed = isOperationClosed(operation.status);
  /* DEF-UI-1: the timeline is scoped to the selected leg only. */
  const legEvents = selected
    ? (detail.data?.legEvents ?? []).filter((event) => event.transport_leg_id === selected.id)
    : [];
  const state = detail.data?.state ?? null;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t("w05.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("w05.subtitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("w05.boundary")}</p>
      </header>

      {operationClosed ? <ReadOnlyNotice /> : null}

      {!operationClosed ? (
        <div className="flex flex-wrap gap-2">
        {planning ? (
          <CreateLegDialog
            operationId={operationId}
            adHoc={false}
            steps={data.data?.steps ?? []}
            onDone={refresh}
          />
        ) : null}
        <CreateLegDialog
          operationId={operationId}
          adHoc
          steps={data.data?.steps ?? []}
          onDone={refresh}
        />
        </div>
      ) : null}

      {legs.length === 0 ? (
        <EmptyState icon={Bus} title={t("w05.empty")} body={t("w05.emptyBody")} />
      ) : (
        <>
          <nav
            aria-label={t("w05.title")}
            className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-elevated/50 p-1"
          >
            {(data.data?.overview?.legs ?? []).map((row) => (
              <button
                key={row.transport_leg_id}
                type="button"
                onClick={() => setSelectedId(row.transport_leg_id)}
                className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
                  selected?.id === row.transport_leg_id
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {row.title}
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${
                    DISPATCH_TONE[row.state.dispatch_state]
                  }`}
                >
                  {dispatchLabel(row.state.dispatch_state, t)}
                </span>
              </button>
            ))}
          </nav>

          {selected ? (
            <>
              <article className="surface-panel p-4 sm:p-5">
                <SectionLabel>{t(`w05.origin.${selected.plan_origin}`)}</SectionLabel>
                <h3 className="mt-1 text-2xl font-semibold tracking-tight">{selected.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {t(`w05.kind.${selected.leg_kind}`)}
                  {selected.origin_label ? ` · ${selected.origin_label}` : ""}
                  {selected.destination_label ? ` → ${selected.destination_label}` : ""}
                </p>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  {[
                    [t("w05.leg.plannedDeparture"), state?.planned_departure],
                    [t("w05.leg.expectedDeparture"), state?.expected_departure],
                    [t("w05.leg.actualDeparture"), state?.actual_departure],
                    [t("w05.leg.plannedArrival"), state?.planned_arrival],
                    [t("w05.leg.expectedArrival"), state?.expected_arrival],
                    [t("w05.leg.actualArrival"), state?.actual_arrival],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="tabular-nums">
                        {value
                          ? formatDateTime(value as string, { locale, timeZone })
                          : "—"}
                      </dd>
                    </div>
                  ))}
                </dl>

                {state?.return_time ? (
                  <p className="mt-3 rounded-lg bg-elevated px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t("w05.leg.returnTime")}: </span>
                    <span className="tabular-nums">
                      {formatDateTime(state.return_time, { locale, timeZone })}
                    </span>
                  </p>
                ) : null}

                {state?.departure_delay_minutes || state?.arrival_delay_minutes ? (
                  <p className="mt-2 text-sm text-warning">
                    {t("w05.leg.delay")}:{" "}
                    {state?.departure_delay_minutes ?? state?.arrival_delay_minutes}{" "}
                    {t("w05.leg.minutes")}
                  </p>
                ) : null}

                {!operationClosed ? (
                  <>
                <div className="mt-4 space-y-3">
                  <SectionLabel>{t("w05.action.assignVehicle")}</SectionLabel>
                  <AssignmentPanel
                    leg={selected}
                    state={state}
                    vehicles={data.data?.vehicles ?? []}
                    drivers={data.data?.drivers ?? []}
                    onRefresh={refresh}
                  />
                </div>

                <div className="mt-5">
                  <SectionLabel>{t("w05.state.requested")}</SectionLabel>
                  <div className="mt-2">
                    <DispatchActions leg={selected} state={state} onRefresh={refresh} />
                  </div>
                </div>

                <div className="mt-5">
                  <LegControls leg={selected} state={state} onRefresh={refresh} />
                </div>
                  </>
                ) : null}
              </article>

              <StopsPanel
                leg={selected}
                manifest={detail.data?.manifest ?? null}
                state={state}
                timeZone={timeZone}
                onRefresh={refresh}
              />

              <SeatsPanel
                leg={selected}
                manifest={detail.data?.manifest ?? null}
                candidates={detail.data?.candidates ?? null}
                state={state}
                timeZone={timeZone}
                onRefresh={refresh}
              />
            </>
          ) : null}
        </>
      )}

      {/* SELECTED-LEG TIMELINE: never mixes facts from other legs of this operation. */}
      <section className="surface-panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          <SectionLabel>{t("w05.timeline")}</SectionLabel>
          {selected ? (
            <span className="text-xs text-muted-foreground">· {selected.title}</span>
          ) : null}
        </div>
        {legEvents.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("w05.noEvents")}</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {legEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDateTime(event.occurred_at, { locale, timeZone })}
                </span>
                <span>{transportEventLabel(event.event_type, t)}</span>
                {event.note ? (
                  <span className="text-muted-foreground">— {event.note}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
