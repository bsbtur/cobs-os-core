import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, Clock, DoorOpen, Plus, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/format";
import {
  GUEST_STATE_TONE,
  GUEST_TRANSITIONS,
  STAY_STATUS_TONE,
  buildTimeline,
  guestStateLabel,
  hospitalityEventLabel,
  isTerminalStay,
  matchesFilter,
  newIdempotencyKey,
  nextAction,
  sortRoomsForAttention,
  type HospitalityEventRow,
  type OperationHospitality,
  type PropertyRow,
  type RoomingFilter,
  type RoomingRoom,
  type StayGuest,
  type StayGuests,
  type StayOverview,
  type StayRooming,
} from "@/lib/w06";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/feedback/empty-state";
import { PanelSkeleton } from "@/components/feedback/loading";
import { feedback } from "@/components/feedback/feedback";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/operations/$operationId/hospitality")({
  head: () => ({
    meta: [
      { title: "Hospitality — COBS OS stays, rooming and check-in" },
      {
        name: "description",
        content:
          "Operational accommodation: stays, rooms, rooming, check-in and check-out derived from recorded hospitality facts.",
      },
      { property: "og:title", content: "Hospitality — COBS OS stays, rooming and check-in" },
      {
        property: "og:description",
        content: "Assigning a room is never a check-in. Every actual state comes from facts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HospitalityPage,
});

/** Drops undefined keys so optional RPC arguments stay absent rather than explicit undefined. */
function rpcArgs<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
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

const iso = (value: string) => (value ? new Date(value).toISOString() : undefined);

/* ------------------------------------------------------------------ */
/* Create stay                                                         */
/* ------------------------------------------------------------------ */

function CreateStayDialog({
  operationId,
  properties,
  onDone,
}: {
  operationId: string;
  properties: PropertyRow[];
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [propertyId, setPropertyId] = React.useState("");
  const [name, setName] = React.useState("");
  const [checkIn, setCheckIn] = React.useState("");
  const [checkOut, setCheckOut] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_hospitality_stay", {
        _operation_id: operationId,
        _property_id: propertyId,
        _name: name,
        _planned_check_in: iso(checkIn)!,
        _planned_check_out: iso(checkOut)!,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w06.stay.saved"));
      setOpen(false);
      setName("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const property = properties.find((row) => row.id === propertyId) ?? null;

  return (
    <>
      <Button className="min-h-11" onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" aria-hidden="true" />
        {t("w06.stay.add")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("w06.stay.add")}</DialogTitle>
          </DialogHeader>
          {properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("w06.stay.noProperty")}</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="stay-property">{t("w06.stay.property")}</Label>
                <select
                  id="stay-property"
                  className={SELECT_CLASS}
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                >
                  <option value="">—</option>
                  {properties.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                      {row.city ? ` · ${row.city}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stay-name">{t("w06.stay.name")}</Label>
                <Input id="stay-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="stay-in">{t("w06.stay.plannedIn")}</Label>
                  <Input
                    id="stay-in"
                    type="datetime-local"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stay-out">{t("w06.stay.plannedOut")}</Label>
                  <Input
                    id="stay-out"
                    type="datetime-local"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
              </div>
              <div className="rounded-lg bg-elevated px-3 py-2 text-sm">
                <SectionLabel>{t("w06.stay.review")}</SectionLabel>
                <p className="mt-1">
                  {property ? property.name : "—"}
                  {checkIn ? ` · ${formatDateTime(iso(checkIn)!, { locale })}` : ""}
                  {checkOut ? ` → ${formatDateTime(iso(checkOut)!, { locale })}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("w06.stay.reviewHint")}</p>
              </div>
              <Button
                className="min-h-11 w-full"
                disabled={
                  create.isPending ||
                  !propertyId ||
                  name.trim() === "" ||
                  checkIn === "" ||
                  checkOut === ""
                }
                onClick={() => create.mutate()}
              >
                {t("w06.stay.add")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Room assignment                                                     */
/* ------------------------------------------------------------------ */

function RoomPicker({
  guest,
  rooms,
  canOverride,
  onDone,
}: {
  guest: StayGuest;
  rooms: RoomingRoom[];
  canOverride: boolean;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [overrideRoomId, setOverrideRoomId] = React.useState<string | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");
  const changing = Boolean(guest.room_assignment_id);

  const call = useMutation({
    mutationFn: async (payload: { roomId: string; allowOvercapacity: boolean; why: string }) => {
      if (changing) {
        const { error } = await supabase.rpc("change_room", {
          _stay_participation_id: guest.stay_participation_id,
          _room_id: payload.roomId,
          _reason: payload.why,
          _idempotency_key: newIdempotencyKey(),
          _allow_overcapacity: payload.allowOvercapacity,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc(
          "assign_room",
          rpcArgs({
            _stay_participation_id: guest.stay_participation_id,
            _room_id: payload.roomId,
            _idempotency_key: newIdempotencyKey(),
            _allow_overcapacity: payload.allowOvercapacity,
            _reason: payload.why || undefined,
          }),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      feedback.success(t("w06.action.recorded"));
      setOpen(false);
      setReason("");
      setOverrideRoomId(null);
      setOverrideReason("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const selectable = rooms.filter((room) => room.room_id !== guest.room_id);

  return (
    <>
      <Button variant="outline" size="sm" className="min-h-11" onClick={() => setOpen(true)}>
        {changing ? t("w06.action.changeRoom") : t("w06.action.assignRoom")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {changing ? t("w06.action.changeRoom") : t("w06.action.assignRoom")} ·{" "}
              {guest.full_name}
            </DialogTitle>
          </DialogHeader>

          {changing ? (
            <p className="text-sm text-muted-foreground">
              {t("w06.room.current")}: <span className="font-medium">{guest.room_label}</span>
            </p>
          ) : null}

          {changing ? (
            <div className="space-y-1.5">
              <Label htmlFor="move-reason">{t("w06.action.reason")}</Label>
              <Input id="move-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          ) : null}

          {selectable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("w06.room.none")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {sortRoomsForAttention(selectable).map((room) => {
                const blocked = room.room_status === "blocked";
                const full = room.occupancy >= room.capacity;
                const needsOverride = full && !blocked;
                const disabled =
                  blocked ||
                  (needsOverride && !canOverride) ||
                  call.isPending ||
                  (changing && reason.trim() === "");
                return (
                  <li key={room.room_id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        needsOverride
                          ? setOverrideRoomId(room.room_id)
                          : call.mutate({
                              roomId: room.room_id,
                              allowOvercapacity: false,
                              why: reason,
                            })
                      }
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-elevated disabled:opacity-50"
                    >
                      <span className="font-semibold tabular-nums">{room.label}</span>
                      {room.floor_label ? (
                        <span className="text-muted-foreground">{room.floor_label}</span>
                      ) : null}
                      <span className="ml-auto tabular-nums text-muted-foreground">
                        {room.occupancy}/{room.capacity}
                      </span>
                      <span className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {blocked
                          ? t("w06.room.blocked")
                          : full
                            ? t("w06.room.full")
                            : t("w06.room.available")}
                      </span>
                    </button>

                    {/* CAPACITY OVERRIDE — owner/admin only, never silent. */}
                    {overrideRoomId === room.room_id && canOverride ? (
                      <div className="mt-2 space-y-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
                        <p className="text-sm font-medium text-warning">
                          {t("w06.override.warning")}
                        </p>
                        <Label htmlFor={`override-${room.room_id}`}>
                          {t("w06.override.reason")}
                        </Label>
                        <Input
                          id={`override-${room.room_id}`}
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">{t("w06.override.help")}</p>
                        <Button
                          className="min-h-11 w-full"
                          variant="outline"
                          disabled={call.isPending || overrideReason.trim() === ""}
                          onClick={() =>
                            call.mutate({
                              roomId: room.room_id,
                              allowOvercapacity: true,
                              why: changing ? reason || overrideReason : overrideReason,
                            })
                          }
                        >
                          {t("w06.override.confirm")}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReleaseRoomButton({ guest, onDone }: { guest: StayGuest; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const release = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("release_room", {
        _stay_participation_id: guest.stay_participation_id,
        _reason: reason,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w06.action.recorded"));
      setOpen(false);
      setReason("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <>
      <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setOpen(true)}>
        {t("w06.action.releaseRoom")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("w06.action.releaseRoom")} · {guest.full_name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("w06.action.releaseHint")}</p>
          <div className="space-y-1.5">
            <Label htmlFor="release-reason">{t("w06.action.reason")}</Label>
            <Input id="release-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button
            className="min-h-11 w-full"
            disabled={release.isPending || reason.trim() === ""}
            onClick={() => release.mutate()}
          >
            {t("w06.action.releaseRoom")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Guest row                                                           */
/* ------------------------------------------------------------------ */

function GuestRow({
  guest,
  rooms,
  checkinOpen,
  terminal,
  canOverride,
  onDone,
}: {
  guest: StayGuest;
  rooms: RoomingRoom[];
  checkinOpen: boolean;
  terminal: boolean;
  canOverride: boolean;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [noShowReason, setNoShowReason] = React.useState("");
  const [askNoShow, setAskNoShow] = React.useState(false);

  const fact = useMutation({
    mutationFn: async (action: "check_in" | "check_out" | "no_show") => {
      if (action === "check_in") {
        const { error } = await supabase.rpc("record_guest_checked_in", {
          _stay_participation_id: guest.stay_participation_id,
          _idempotency_key: newIdempotencyKey(),
        });
        if (error) throw error;
      } else if (action === "check_out") {
        const { error } = await supabase.rpc("record_guest_checked_out", {
          _stay_participation_id: guest.stay_participation_id,
          _idempotency_key: newIdempotencyKey(),
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("record_guest_no_show", {
          _stay_participation_id: guest.stay_participation_id,
          _reason: noShowReason,
          _idempotency_key: newIdempotencyKey(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      feedback.success(t("w06.action.recorded"));
      setAskNoShow(false);
      setNoShowReason("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const participation = useMutation({
    mutationFn: async (action: "remove" | "restore") => {
      if (action === "remove") {
        const { error } = await supabase.rpc("remove_stay_participation", {
          _stay_participation_id: guest.stay_participation_id,
          _reason: t("w06.participation.remove"),
          _idempotency_key: newIdempotencyKey(),
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("restore_stay_participation", {
          _stay_participation_id: guest.stay_participation_id,
          _idempotency_key: newIdempotencyKey(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      feedback.success(t("w06.participation.saved"));
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const allowed = GUEST_TRANSITIONS[guest.state];
  /* ROOM != CHECK-IN: check-in needs an open stay check-in and an open room assignment. */
  const canCheckIn = checkinOpen && Boolean(guest.room_id);

  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-border/60 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{guest.full_name}</p>
        <p className="text-xs text-muted-foreground">
          {guest.room_label ? guest.room_label : t("w06.rooming.noRoom")}
          {!guest.is_active ? ` · ${t("w06.rooming.removed")}` : ""}
        </p>
      </div>

      <span className={`rounded px-1.5 py-0.5 text-[11px] ${GUEST_STATE_TONE[guest.state]}`}>
        {guestStateLabel(guest.state, t)}
      </span>

      {terminal ? null : guest.is_active ? (
        <div className="flex flex-wrap gap-1.5">
          <RoomPicker guest={guest} rooms={rooms} canOverride={canOverride} onDone={onDone} />
          {guest.room_assignment_id ? <ReleaseRoomButton guest={guest} onDone={onDone} /> : null}

          {allowed.includes("check_in") ? (
            <Button
              size="sm"
              className="min-h-11"
              disabled={fact.isPending || !canCheckIn}
              onClick={() => fact.mutate("check_in")}
            >
              {t("w06.action.checkIn")}
            </Button>
          ) : null}
          {allowed.includes("check_out") ? (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={fact.isPending}
              onClick={() => fact.mutate("check_out")}
            >
              {t("w06.action.checkOut")}
            </Button>
          ) : null}
          {allowed.includes("no_show") ? (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11"
              onClick={() => setAskNoShow((value) => !value)}
            >
              {t("w06.action.noShow")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 text-muted-foreground"
            disabled={participation.isPending}
            onClick={() => participation.mutate("remove")}
          >
            {t("w06.participation.remove")}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={participation.isPending}
          onClick={() => participation.mutate("restore")}
        >
          {t("w06.participation.restore")}
        </Button>
      )}

      {askNoShow ? (
        <div className="w-full space-y-2 rounded-lg bg-elevated p-3">
          <p className="text-xs text-muted-foreground">{t("w06.guest.noShowMeaning")}</p>
          <Input
            aria-label={t("w06.action.reason")}
            value={noShowReason}
            onChange={(e) => setNoShowReason(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={fact.isPending || noShowReason.trim() === ""}
            onClick={() => fact.mutate("no_show")}
          >
            {t("w06.action.noShow")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Room edit                                                           */
/* ------------------------------------------------------------------ */

/** ROOM-LEVEL ONLY: label, capacity, floor and notes. No bed-level fields exist. */
function EditRoomDialog({ room, onDone }: { room: RoomingRoom; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(room.label);
  const [capacity, setCapacity] = React.useState(String(room.capacity));
  const [floor, setFloor] = React.useState(room.floor_label ?? "");
  const [notes, setNotes] = React.useState(room.notes ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "update_hospitality_room",
        rpcArgs({
          _room_id: room.room_id,
          _idempotency_key: newIdempotencyKey(),
          _label: label.trim() || undefined,
          _capacity: Number(capacity) || undefined,
          _floor_label: floor.trim() || undefined,
          _notes: notes.trim() || undefined,
        }),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w06.edit.saved"));
      setOpen(false);
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <>
      <Button size="sm" variant="outline" className="mt-2 min-h-11" onClick={() => setOpen(true)}>
        {t("w06.room.edit")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("w06.room.edit")} · {room.label}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`room-edit-label-${room.room_id}`}>{t("w06.room.label")}</Label>
              <Input
                id={`room-edit-label-${room.room_id}`}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`room-edit-capacity-${room.room_id}`}>{t("w06.room.capacity")}</Label>
              <Input
                id={`room-edit-capacity-${room.room_id}`}
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`room-edit-floor-${room.room_id}`}>{t("w06.room.floor")}</Label>
              <Input
                id={`room-edit-floor-${room.room_id}`}
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`room-edit-notes-${room.room_id}`}>{t("w06.room.notes")}</Label>
              <Input
                id={`room-edit-notes-${room.room_id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                className="min-h-11 w-full"
                disabled={save.isPending || label.trim() === ""}
                onClick={() => save.mutate()}
              >
                {t("w06.edit.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Rooms panel                                                         */
/* ------------------------------------------------------------------ */

function RoomsPanel({
  stayId,
  rooms,
  terminal,
  onDone,
}: {
  stayId: string;
  rooms: RoomingRoom[];
  terminal: boolean;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [label, setLabel] = React.useState("");
  const [capacity, setCapacity] = React.useState("2");
  const [count, setCount] = React.useState("1");
  const [floor, setFloor] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const total = Math.max(1, Math.min(30, Number(count) || 1));
      const base = Number(label);
      for (let index = 0; index < total; index += 1) {
        /* Each room is its own approved command call with its own idempotency key. */
        const roomLabel =
          total === 1
            ? label
            : Number.isFinite(base)
              ? String(base + index)
              : `${label} ${index + 1}`;
        const { error } = await supabase.rpc(
          "create_hospitality_room",
          rpcArgs({
            _stay_id: stayId,
            _label: roomLabel,
            _capacity: Number(capacity) || 1,
            _idempotency_key: newIdempotencyKey(),
            _floor_label: floor || undefined,
          }),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      feedback.success(t("w06.room.saved"));
      setLabel("");
      setCount("1");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const status = useMutation({
    mutationFn: async (payload: { roomId: string; block: boolean }) => {
      if (payload.block) {
        const { error } = await supabase.rpc("block_hospitality_room", {
          _room_id: payload.roomId,
          _reason: t("w06.room.block"),
          _idempotency_key: newIdempotencyKey(),
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("unblock_hospitality_room", {
          _room_id: payload.roomId,
          _idempotency_key: newIdempotencyKey(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      feedback.success(t("w06.action.recorded"));
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <section className="surface-panel p-4">
      <div className="flex items-center gap-2">
        <DoorOpen className="size-4 text-muted-foreground" aria-hidden="true" />
        <SectionLabel>{t("w06.room.title")}</SectionLabel>
      </div>

      {rooms.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("w06.room.empty")}</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {sortRoomsForAttention(rooms).map((room) => {
            const blocked = room.room_status === "blocked";
            const full = room.occupancy >= room.capacity;
            return (
              <li key={room.room_id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold tabular-nums">{room.label}</span>
                  {room.floor_label ? (
                    <span className="text-xs text-muted-foreground">{room.floor_label}</span>
                  ) : null}
                  <span
                    className={`ml-auto rounded px-1.5 py-0.5 text-[11px] ${
                      blocked
                        ? "bg-destructive/10 text-destructive"
                        : full
                          ? "bg-warning-soft text-warning"
                          : "bg-success-soft text-success"
                    }`}
                  >
                    {blocked
                      ? t("w06.room.blocked")
                      : full
                        ? t("w06.room.full")
                        : t("w06.room.available")}
                  </span>
                </div>
                <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                  {room.occupancy}/{room.capacity}
                </p>
                {room.guests.length > 0 ? (
                  <p className="mt-1 text-sm">
                    {room.guests.map((guest) => guest.full_name).join(", ")}
                  </p>
                ) : null}
                {terminal ? null : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 min-h-11"
                      disabled={status.isPending}
                      onClick={() => status.mutate({ roomId: room.room_id, block: !blocked })}
                    >
                      {blocked ? t("w06.room.unblock") : t("w06.room.block")}
                    </Button>
                    <EditRoomDialog room={room} onDone={onDone} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {terminal ? null : (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="room-label">{t("w06.room.label")}</Label>
            <Input id="room-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-capacity">{t("w06.room.capacity")}</Label>
            <Input
              id="room-capacity"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-floor">{t("w06.room.floor")}</Label>
            <Input id="room-floor" value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-count">{t("w06.room.multi")}</Label>
            <Input
              id="room-count"
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div className="sm:col-span-4">
            <p className="text-xs text-muted-foreground">{t("w06.room.multiHint")}</p>
            <Button
              className="mt-2 min-h-11"
              variant="outline"
              disabled={create.isPending || label.trim() === ""}
              onClick={() => create.mutate()}
            >
              <Plus className="mr-2 size-4" aria-hidden="true" />
              {t("w06.room.add")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stay controls                                                       */
/* ------------------------------------------------------------------ */

/** datetime-local needs a local wall-clock string; UTC storage is untouched. */
function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * PLAN CORRECTION BEFORE FREEZE. Name/notes stay editable while the stay is open;
 * the planned baseline is only editable while the stay is a draft — the backend is final authority.
 */
function StayPlanEditor({ overview, onDone }: { overview: StayOverview; onDone: () => void }) {
  const { t, locale } = useI18n();
  const draft = overview.status === "draft";
  const [name, setName] = React.useState(overview.name);
  const [notes, setNotes] = React.useState(overview.notes ?? "");
  const [plannedIn, setPlannedIn] = React.useState(toLocalInput(overview.planned_check_in));
  const [plannedOut, setPlannedOut] = React.useState(toLocalInput(overview.planned_check_out));

  const save = useMutation({
    mutationFn: async () => {
      const identityChanged = name !== overview.name || notes !== (overview.notes ?? "");
      if (identityChanged) {
        const { error } = await supabase.rpc(
          "update_hospitality_stay",
          rpcArgs({
            _stay_id: overview.stay_id,
            _idempotency_key: newIdempotencyKey(),
            _name: name.trim() || undefined,
            _notes: notes.trim() || undefined,
          }),
        );
        if (error) throw error;
      }
      if (
        draft &&
        (plannedIn !== toLocalInput(overview.planned_check_in) ||
          plannedOut !== toLocalInput(overview.planned_check_out))
      ) {
        const { error } = await supabase.rpc("set_stay_planned_window", {
          _stay_id: overview.stay_id,
          _planned_check_in: iso(plannedIn)!,
          _planned_check_out: iso(plannedOut)!,
          _idempotency_key: newIdempotencyKey(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      feedback.success(t("w06.edit.saved"));
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <SectionLabel>{t("w06.stay.editPlan")}</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="stay-edit-name">{t("w06.stay.name")}</Label>
          <Input id="stay-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stay-edit-notes">{t("w06.stay.notes")}</Label>
          <Input id="stay-edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {draft ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="stay-edit-in">{t("w06.stay.plannedIn")}</Label>
              <Input
                id="stay-edit-in"
                type="datetime-local"
                value={plannedIn}
                onChange={(e) => setPlannedIn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stay-edit-out">{t("w06.stay.plannedOut")}</Label>
              <Input
                id="stay-edit-out"
                type="datetime-local"
                value={plannedOut}
                onChange={(e) => setPlannedOut(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {draft ? t("w06.stay.planHint") : t("w06.stay.planFrozen")}
      </p>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={save.isPending || name.trim() === ""}
        onClick={() => save.mutate()}
      >
        {t("w06.edit.save")}
      </Button>
    </div>
  );
}

function StayControls({ overview, onDone }: { overview: StayOverview; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [expectedIn, setExpectedIn] = React.useState("");
  const [expectedOut, setExpectedOut] = React.useState("");
  const [forecastReason, setForecastReason] = React.useState("");
  const [cancelReason, setCancelReason] = React.useState("");
  const [issue, setIssue] = React.useState("");

  const run = useMutation({
    mutationFn: async (action: string) => {
      const key = newIdempotencyKey();
      if (action === "confirm") {
        const { error } = await supabase.rpc("confirm_hospitality_stay", {
          _stay_id: overview.stay_id,
          _idempotency_key: key,
        });
        if (error) throw error;
      } else if (action === "open_checkin") {
        const { error } = await supabase.rpc("open_stay_checkin", {
          _stay_id: overview.stay_id,
          _idempotency_key: key,
        });
        if (error) throw error;
      } else if (action === "checkout") {
        const { error } = await supabase.rpc("complete_stay_checkout", {
          _stay_id: overview.stay_id,
          _idempotency_key: key,
        });
        if (error) throw error;
      } else if (action === "complete") {
        const { error } = await supabase.rpc("complete_hospitality_stay", {
          _stay_id: overview.stay_id,
          _idempotency_key: key,
        });
        if (error) throw error;
      } else if (action === "cancel") {
        const { error } = await supabase.rpc("cancel_hospitality_stay", {
          _stay_id: overview.stay_id,
          _reason: cancelReason,
          _idempotency_key: key,
        });
        if (error) throw error;
      } else if (action === "forecast") {
        const { error } = await supabase.rpc(
          "set_stay_expected_window",
          rpcArgs({
            _stay_id: overview.stay_id,
            _idempotency_key: key,
            _expected_check_in: iso(expectedIn),
            _expected_check_out: iso(expectedOut),
            _note: forecastReason,
          }),
        );
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("note_hospitality_issue", {
          _stay_id: overview.stay_id,
          _note: issue,
          _idempotency_key: key,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      feedback.success(t("w06.action.recorded"));
      setIssue("");
      setForecastReason("");
      setCancelReason("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const checkinOpen = Boolean(overview.checkin_opened_at);
  const checkoutDone = Boolean(overview.checkout_completed_at);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {overview.status === "draft" ? (
          <Button
            className="min-h-11"
            disabled={run.isPending}
            onClick={() => run.mutate("confirm")}
          >
            {t("w06.stay.confirm")}
          </Button>
        ) : null}
        {!checkinOpen ? (
          <Button
            className="min-h-11"
            variant="outline"
            disabled={run.isPending || overview.status === "draft"}
            onClick={() => run.mutate("open_checkin")}
          >
            {t("w06.checkin.open")}
          </Button>
        ) : null}
        {checkinOpen && !checkoutDone ? (
          <Button
            className="min-h-11"
            variant="outline"
            disabled={run.isPending}
            onClick={() => run.mutate("checkout")}
          >
            {t("w06.checkout.completeStay")}
          </Button>
        ) : null}
        {checkoutDone ? (
          <Button
            className="min-h-11"
            variant="outline"
            disabled={run.isPending}
            onClick={() => run.mutate("complete")}
          >
            {t("w06.stay.complete")}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t("w06.checkout.hint")}</p>

      <StayPlanEditor overview={overview} onDone={onDone} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="forecast-in">{t("w06.forecast.in")}</Label>
          <Input
            id="forecast-in"
            type="datetime-local"
            value={expectedIn}
            onChange={(e) => setExpectedIn(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="forecast-out">{t("w06.forecast.out")}</Label>
          <Input
            id="forecast-out"
            type="datetime-local"
            value={expectedOut}
            onChange={(e) => setExpectedOut(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="forecast-reason">{t("w06.forecast.reason")}</Label>
          <Input
            id="forecast-reason"
            value={forecastReason}
            onChange={(e) => setForecastReason(e.target.value)}
          />
        </div>
      </div>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={
          run.isPending || (expectedIn === "" && expectedOut === "") || forecastReason.trim() === ""
        }
        onClick={() => run.mutate("forecast")}
      >
        {t("w06.forecast.save")}
      </Button>

      <div className="space-y-1.5">
        <SectionLabel>{t("w06.issue.title")}</SectionLabel>
        <Textarea
          aria-label={t("w06.issue.title")}
          placeholder={t("w06.issue.placeholder")}
          value={issue}
          onChange={(e) => setIssue(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("w06.issue.privacy")}</p>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={run.isPending || issue.trim() === ""}
          onClick={() => run.mutate("issue")}
        >
          {t("w06.issue.title")}
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cancel-reason">{t("w06.stay.cancelReason")}</Label>
        <Input
          id="cancel-reason"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
        <Button
          variant="ghost"
          className="min-h-11 text-destructive"
          disabled={run.isPending || cancelReason.trim() === ""}
          onClick={() => run.mutate("cancel")}
        >
          {t("w06.stay.cancel")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add participation                                                   */
/* ------------------------------------------------------------------ */

function AddParticipation({
  stayId,
  candidates,
  onDone,
}: {
  stayId: string;
  candidates: Array<{ participation_id: string; full_name: string }>;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [participationId, setParticipationId] = React.useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_stay_participation", {
        _stay_id: stayId,
        _participation_id: participationId,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success(t("w06.participation.saved"));
      setParticipationId("");
      onDone();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
      <div className="space-y-1.5">
        <Label htmlFor="add-participation">{t("w06.participation.add")}</Label>
        <select
          id="add-participation"
          className={SELECT_CLASS}
          value={participationId}
          onChange={(e) => setParticipationId(e.target.value)}
        >
          <option value="">{candidates.length === 0 ? t("w06.participation.none") : "—"}</option>
          {candidates.map((row) => (
            <option key={row.participation_id} value={row.participation_id}>
              {row.full_name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t("w06.participation.addHint")}</p>
      </div>
      <Button
        className="min-h-11 self-end"
        variant="outline"
        disabled={add.isPending || participationId === ""}
        onClick={() => add.mutate()}
      >
        <Plus className="mr-2 size-4" aria-hidden="true" />
        {t("w06.participation.add")}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function HospitalityPage() {
  const { operationId } = useParams({
    from: "/_authenticated/operations/$operationId/hospitality",
  });
  const { t, locale } = useI18n();
  const { canManage, tenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<RoomingFilter>("all");

  const base = useQuery({
    queryKey: ["hospitality", operationId],
    queryFn: async () => {
      const [operation, hospitality, properties, participations] = await Promise.all([
        supabase.from("operations").select("*").eq("id", operationId).maybeSingle(),
        supabase.rpc("w06_operation_hospitality", { _operation_id: operationId }),
        supabase.from("hospitality_properties").select("*").eq("is_active", true).order("name"),
        supabase
          .from("operation_participations")
          .select("id, status, people(full_name)")
          .eq("operation_id", operationId)
          .neq("status", "cancelled"),
      ]);
      if (operation.error) throw operation.error;
      if (hospitality.error) throw hospitality.error;
      if (properties.error) throw properties.error;
      if (participations.error) throw participations.error;
      return {
        operation: operation.data,
        hospitality: (hospitality.data ?? null) as unknown as OperationHospitality | null,
        properties: (properties.data ?? []) as PropertyRow[],
        participations: (participations.data ?? []) as unknown as Array<{
          id: string;
          people: { full_name: string } | null;
        }>,
      };
    },
  });

  const stays = base.data?.hospitality?.stays ?? [];
  const selectedStayId =
    stays.find((s) => s.stay_id === selectedId)?.stay_id ?? stays[0]?.stay_id ?? null;

  const detail = useQuery({
    queryKey: ["hospitality-stay", selectedStayId],
    enabled: Boolean(selectedStayId),
    queryFn: async () => {
      const [overview, rooming, guests, events] = await Promise.all([
        supabase.rpc("w06_stay_overview", { _stay_id: selectedStayId! }),
        supabase.rpc("w06_stay_rooming", { _stay_id: selectedStayId! }),
        supabase.rpc("w06_stay_guests", { _stay_id: selectedStayId! }),
        supabase
          .from("hospitality_events")
          .select("*")
          .eq("stay_id", selectedStayId!)
          .order("occurred_at", { ascending: false })
          .limit(80),
      ]);
      if (overview.error) throw overview.error;
      if (rooming.error) throw rooming.error;
      if (guests.error) throw guests.error;
      if (events.error) throw events.error;
      return {
        overview: (overview.data ?? null) as unknown as StayOverview | null,
        rooming: (rooming.data ?? null) as unknown as StayRooming | null,
        guests: (guests.data ?? null) as unknown as StayGuests | null,
        events: (events.data ?? []) as HospitalityEventRow[],
      };
    },
  });

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["hospitality", operationId] });
    void queryClient.invalidateQueries({ queryKey: ["hospitality-stay"] });
  }, [operationId, queryClient]);

  /* REALTIME: exactly the two published W06 tables, scoped and torn down on unmount. */
  React.useEffect(() => {
    const channel = supabase
      .channel(`hospitality-${operationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "hospitality_events",
          filter: `operation_id=eq.${operationId}`,
        },
        () => refresh(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "hospitality_rooms" }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [operationId, refresh]);

  if (base.isLoading) return <PanelSkeleton />;
  if (base.isError) {
    return (
      <EmptyState
        icon={BedDouble}
        title={t("op.loadError")}
        body={t("op.loadErrorBody")}
        action={
          <Button variant="outline" className="min-h-11" onClick={() => void base.refetch()}>
            {t("op.retry")}
          </Button>
        }
      />
    );
  }

  const operation = base.data?.operation;
  if (!operation) {
    return <EmptyState icon={BedDouble} title={t("w06.forbidden")} body={t("w06.forbiddenBody")} />;
  }

  if (selectedStayId && detail.isLoading) return <PanelSkeleton />;
  if (selectedStayId && detail.isError) {
    return (
      <EmptyState
        icon={BedDouble}
        title={t("op.loadError")}
        body={t("op.loadErrorBody")}
        action={
          <Button variant="outline" className="min-h-11" onClick={() => void detail.refetch()}>
            {t("op.retry")}
          </Button>
        }
      />
    );
  }

  const timeZone = operation.timezone ?? tenant?.timezone ?? undefined;
  const overview = detail.data?.overview ?? null;
  const rooms = detail.data?.rooming?.rooms ?? [];
  const guests = detail.data?.guests?.guests ?? [];
  const terminal = isTerminalStay(overview?.status);
  const checkinOpen = Boolean(overview?.checkin_opened_at);
  const action = nextAction(overview, rooms);

  const roomLabels = Object.fromEntries(rooms.map((room) => [room.room_id, room.label]));
  const personByParticipation = Object.fromEntries(
    guests.map((guest) => [guest.stay_participation_id, guest.full_name]),
  );
  /* SCOPED TIMELINE: only facts of the selected stay ever reach this list. */
  const timeline = buildTimeline(
    (detail.data?.events ?? []).filter((event) => event.stay_id === selectedStayId),
    roomLabels,
    personByParticipation,
  );

  const visibleGuests = guests.filter(
    (guest) =>
      matchesFilter(guest, filter) &&
      guest.full_name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const already = new Set(guests.map((guest) => guest.participation_id));
  const candidates = (base.data?.participations ?? [])
    .filter((row) => !already.has(row.id))
    .map((row) => ({ participation_id: row.id, full_name: row.people?.full_name ?? "—" }));

  const counters: Array<{ key: string; label: string; value: number; filter: RoomingFilter }> = [
    {
      key: "rooms",
      label: t("w06.count.rooms"),
      value: rooms.length,
      filter: "all",
    },
    {
      key: "allocated",
      label: t("w06.count.allocated"),
      value: overview?.counts.with_room ?? 0,
      filter: "with_room",
    },
    {
      key: "checkins",
      label: t("w06.count.checkins"),
      value: overview?.counts.checked_in ?? 0,
      filter: "checked_in",
    },
    {
      key: "withoutRoom",
      label: t("w06.count.withoutRoom"),
      value: overview?.counts.without_room ?? 0,
      filter: "without_room",
    },
    {
      key: "issues",
      label: t("w06.count.issues"),
      value: overview?.issues ?? 0,
      filter: "all",
    },
  ];

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t("w06.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("w06.subtitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("w06.boundary")}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <CreateStayDialog
          operationId={operationId}
          properties={base.data?.properties ?? []}
          onDone={refresh}
        />
      </div>

      {stays.length === 0 ? (
        <EmptyState icon={BedDouble} title={t("w06.empty")} body={t("w06.emptyBody")} />
      ) : (
        <>
          <nav
            aria-label={t("w06.stay.selector")}
            className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-elevated/50 p-1"
          >
            {stays.map((stay) => (
              <button
                key={stay.stay_id}
                type="button"
                onClick={() => setSelectedId(stay.stay_id)}
                className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
                  selectedStayId === stay.stay_id
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {stay.property_name}
                {stay.city ? ` · ${stay.city}` : ""}
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${STAY_STATUS_TONE[stay.status]}`}
                >
                  {t(`w06.status.${stay.status}`)}
                </span>
              </button>
            ))}
          </nav>

          {detail.isLoading ? <PanelSkeleton /> : null}

          {overview ? (
            <>
              <article className="surface-panel p-4 sm:p-5">
                <SectionLabel>{t(`w06.kind.${overview.property.property_kind}`)}</SectionLabel>
                <h3 className="mt-1 text-2xl font-semibold tracking-tight">
                  {overview.property.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {[
                    overview.property.city,
                    overview.property.region,
                    overview.property.country_code,
                  ]
                    .filter(Boolean)
                    .join(" · ") || overview.name}
                </p>
                <span
                  className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[11px] ${
                    STAY_STATUS_TONE[overview.status]
                  }`}
                >
                  {t(`w06.status.${overview.status}`)}
                </span>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  {[
                    [t("w06.planned"), overview.planned_check_in, overview.planned_check_out],
                    [t("w06.expected"), overview.expected_check_in, overview.expected_check_out],
                    [t("w06.actual"), overview.checkin_opened_at, overview.checkout_completed_at],
                  ].map(([label, start, end]) => (
                    <div key={label as string} className="rounded-lg border border-border/70 p-3">
                      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-1 tabular-nums">
                        {start
                          ? formatDateTime(start as string, { locale, timeZone })
                          : t("w06.pending")}
                      </dd>
                      <dd className="tabular-nums text-muted-foreground">
                        {end
                          ? formatDateTime(end as string, { locale, timeZone })
                          : t("w06.pending")}
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* NEXT ACTION — deterministic, derived from canonical reads only. */}
                {action ? (
                  <p className="mt-4 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
                      {t("w06.next.title")}
                    </span>
                    <br />
                    {action.count > 0 ? `${action.count} ` : ""}
                    {t(action.key)}
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {counters.map((counter) => (
                    <button
                      key={counter.key}
                      type="button"
                      onClick={() => setFilter(counter.filter)}
                      className="min-h-16 rounded-lg border border-border p-3 text-left transition-colors hover:bg-elevated"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {counter.label}
                      </span>
                      <span className="mt-1 block text-2xl font-semibold tabular-nums">
                        {counter.value}
                      </span>
                    </button>
                  ))}
                </div>

                {terminal ? (
                  <p className="mt-4 rounded-lg bg-elevated px-3 py-2 text-sm text-muted-foreground">
                    {t("w06.stay.terminal")}
                  </p>
                ) : (
                  <div className="mt-5">
                    <StayControls overview={overview} onDone={refresh} />
                  </div>
                )}
              </article>

              <section className="surface-panel p-4">
                <div className="flex items-center gap-2">
                  <BedDouble className="size-4 text-muted-foreground" aria-hidden="true" />
                  <SectionLabel>{t("w06.rooming.title")}</SectionLabel>
                </div>

                {!checkinOpen && !terminal ? (
                  <p className="mt-2 text-xs text-muted-foreground">{t("w06.checkin.notOpen")}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      className="pl-9"
                      aria-label={t("w06.rooming.search")}
                      placeholder={t("w06.rooming.search")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(
                    [
                      "all",
                      "without_room",
                      "with_room",
                      "pending_checkin",
                      "checked_in",
                      "checked_out",
                      "no_show",
                    ] as RoomingFilter[]
                  ).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      className={`min-h-11 rounded-lg px-3 text-sm transition-colors ${
                        filter === value
                          ? "bg-primary-soft text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t(`w06.rooming.filter.${value}`)}
                    </button>
                  ))}
                </div>

                {visibleGuests.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t("w06.rooming.none")}</p>
                ) : (
                  <ul className="mt-2">
                    {visibleGuests.map((guest) => (
                      <GuestRow
                        key={guest.stay_participation_id}
                        guest={guest}
                        rooms={rooms}
                        checkinOpen={checkinOpen}
                        terminal={terminal}
                        canOverride={canManage}
                        onDone={refresh}
                      />
                    ))}
                  </ul>
                )}

                {terminal ? null : (
                  <AddParticipation
                    stayId={overview.stay_id}
                    candidates={candidates}
                    onDone={refresh}
                  />
                )}
              </section>

              <RoomsPanel
                stayId={overview.stay_id}
                rooms={rooms}
                terminal={terminal}
                onDone={refresh}
              />

              <section className="surface-panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
                  <SectionLabel>{t("w06.timeline.title")}</SectionLabel>
                  <span className="text-xs text-muted-foreground">· {overview.property.name}</span>
                </div>
                {timeline.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">{t("w06.timeline.empty")}</p>
                ) : (
                  <ol className="mt-3 space-y-2">
                    {timeline.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {formatDateTime(item.occurred_at, { locale, timeZone })}
                        </span>
                        <span>
                          {item.kind === "move"
                            ? `${item.person ?? ""} ${t("w06.timeline.move")} ${item.from_label ?? "—"} → ${item.to_label ?? "—"}`
                            : `${hospitalityEventLabel(item.event_type, t)}${
                                item.person ? ` · ${item.person}` : ""
                              }${item.to_label ? ` · ${item.to_label}` : ""}`}
                        </span>
                        {item.note ? (
                          <span className="text-muted-foreground">— {item.note}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
