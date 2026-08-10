import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · W06 — Hospitality (properties · stays · rooms · rooming · check-in/out).
 *
 * PROPERTY != STAY · ROOM != ASSIGNMENT · RESERVATION != CHECK-IN.
 * PERSON IS CANONICAL — W03 participation is the only identity; hospitality never copies it.
 * PLANNED != EXPECTED != ACTUAL — actual hospitality state is derived from events only.
 * ROOM-LEVEL ONLY — there is no bed, bunk or berth anywhere in W06.
 * HOSPITALITY NO-SHOW != W04 ABSENCE — it only means the guest never checked in here.
 */

export type PropertyRow = Database["public"]["Tables"]["hospitality_properties"]["Row"];
export type StayRow = Database["public"]["Tables"]["hospitality_stays"]["Row"];
export type RoomRow = Database["public"]["Tables"]["hospitality_rooms"]["Row"];
export type HospitalityEventRow = Database["public"]["Tables"]["hospitality_events"]["Row"];

export type PropertyKind = Database["public"]["Enums"]["hospitality_property_kind"];
export type StayStatus = Database["public"]["Enums"]["hospitality_stay_status"];
export type RoomStatus = Database["public"]["Enums"]["hospitality_room_status"];
export type HospitalityEventType = Database["public"]["Enums"]["hospitality_event_type"];

/** Guest runtime state is DERIVED by app_private.w06_guest_state — never stored. */
export type GuestState = "NOT_ARRIVED" | "CHECKED_IN" | "CHECKED_OUT" | "NO_SHOW";

export const PROPERTY_KINDS: PropertyKind[] = [
  "hotel",
  "hostel",
  "resort",
  "guesthouse",
  "apartment",
  "campus",
  "venue",
  "other",
];

export type StayOverview = {
  stay_id: string;
  tenant_id: string;
  operation_id: string;
  name: string;
  status: StayStatus;
  planned_check_in: string;
  planned_check_out: string;
  expected_check_in: string | null;
  expected_check_out: string | null;
  checkin_opened_at: string | null;
  checkout_completed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  property: {
    property_id: string;
    name: string;
    property_kind: PropertyKind;
    city: string | null;
    region: string | null;
    country_code: string | null;
    address_label: string | null;
    contact_label: string | null;
  };
  counts: {
    guests: number;
    removed: number;
    with_room: number;
    without_room: number;
    checked_in: number;
    checked_out: number;
    no_show: number;
    pending_checkin: number;
  };
  issues: number;
};

export type RoomingRoom = {
  room_id: string;
  label: string;
  capacity: number;
  room_status: RoomStatus;
  floor_label: string | null;
  notes: string | null;
  occupancy: number;
  guests: Array<{
    stay_participation_id: string;
    participation_id: string;
    full_name: string;
    room_assignment_id: string;
    assigned_at: string;
    state: GuestState;
  }>;
};

export type StayRooming = { stay_id: string; rooms: RoomingRoom[] };

export type StayGuest = {
  stay_participation_id: string;
  participation_id: string;
  full_name: string;
  participation_kind: string;
  participation_status: string;
  is_active: boolean;
  removal_reason: string | null;
  state: GuestState;
  room_id: string | null;
  room_label: string | null;
  room_assignment_id: string | null;
};

export type StayGuests = { stay_id: string; guests: StayGuest[] };

export type OperationHospitality = {
  operation_id: string;
  stays: Array<{
    stay_id: string;
    name: string;
    status: StayStatus;
    property_name: string;
    property_kind: PropertyKind;
    city: string | null;
    planned_check_in: string;
    planned_check_out: string;
    expected_check_in: string | null;
    expected_check_out: string | null;
    rooms: number;
    guests: number;
    with_room: number;
    checked_in: number;
    issues: number;
  }>;
};

/** Completed and cancelled stays are HISTORY ONLY — every mutation control disappears. */
export function isTerminalStay(status: StayStatus | null | undefined) {
  return status === "completed" || status === "cancelled";
}

/** Mirrors the backend transition matrix; the UI never offers an illegal move. */
export const GUEST_TRANSITIONS: Record<GuestState, Array<"check_in" | "check_out" | "no_show">> = {
  NOT_ARRIVED: ["check_in", "no_show"],
  CHECKED_IN: ["check_out"],
  CHECKED_OUT: [],
  NO_SHOW: [],
};

export const GUEST_STATE_TONE: Record<GuestState, string> = {
  NOT_ARRIVED: "bg-elevated text-muted-foreground",
  CHECKED_IN: "bg-success-soft text-success",
  CHECKED_OUT: "bg-primary-soft text-primary",
  NO_SHOW: "bg-warning-soft text-warning",
};

export const STAY_STATUS_TONE: Record<StayStatus, string> = {
  draft: "bg-elevated text-muted-foreground",
  confirmed: "bg-primary-soft text-primary",
  active: "bg-success-soft text-success",
  completed: "bg-elevated text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

/** Raw enums never reach the interface. */
export function guestStateLabel(state: GuestState, t: (key: string) => string) {
  return t(`w06.guest.${state}`);
}

export function hospitalityEventLabel(type: HospitalityEventType, t: (key: string) => string) {
  return t(`w06.event.${type}`);
}

export type RoomingFilter =
  | "all"
  | "without_room"
  | "with_room"
  | "pending_checkin"
  | "checked_in"
  | "checked_out"
  | "no_show";

export function matchesFilter(guest: StayGuest, filter: RoomingFilter) {
  switch (filter) {
    case "without_room":
      return !guest.room_id;
    case "with_room":
      return Boolean(guest.room_id);
    case "pending_checkin":
      return guest.state === "NOT_ARRIVED";
    case "checked_in":
      return guest.state === "CHECKED_IN";
    case "checked_out":
      return guest.state === "CHECKED_OUT";
    case "no_show":
      return guest.state === "NO_SHOW";
    default:
      return true;
  }
}

/**
 * DETERMINISTIC next action — no scoring, no recommendation engine.
 * Priority order is fixed and derived only from canonical W06 reads.
 */
export function nextAction(
  overview: StayOverview | null,
  rooms: RoomingRoom[],
): { key: string; count: number } | null {
  if (!overview) return null;
  if (isTerminalStay(overview.status)) return { key: "w06.next.terminal", count: 0 };
  const blocked = rooms.filter((room) => room.room_status === "blocked").length;
  if (rooms.length === 0) return { key: "w06.next.noRooms", count: 0 };
  if (overview.counts.guests === 0) return { key: "w06.next.noGuests", count: 0 };
  if (overview.counts.without_room > 0)
    return { key: "w06.next.withoutRoom", count: overview.counts.without_room };
  if (!overview.checkin_opened_at) return { key: "w06.next.openCheckin", count: 0 };
  if (overview.counts.pending_checkin > 0)
    return { key: "w06.next.pendingCheckin", count: overview.counts.pending_checkin };
  if (blocked > 0) return { key: "w06.next.blockedRooms", count: blocked };
  if (overview.counts.checked_in > 0)
    return { key: "w06.next.stillCheckedIn", count: overview.counts.checked_in };
  return { key: "w06.next.allSettled", count: 0 };
}

/** Operational attention first: blocked rooms, then full rooms, then the rest. */
export function sortRoomsForAttention(rooms: RoomingRoom[]) {
  const weight = (room: RoomingRoom) => {
    if (room.room_status === "blocked") return 0;
    if (room.occupancy >= room.capacity) return 1;
    return 2;
  };
  return [...rooms].sort(
    (a, b) => weight(a) - weight(b) || a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

export type TimelineItem = {
  id: string;
  occurred_at: string;
  /** Correlated ROOM_RELEASED + ROOM_ASSIGNED pairs render as one move. */
  kind: "event" | "move";
  event_type: HospitalityEventType;
  note: string | null;
  from_label?: string | null;
  to_label?: string | null;
  person?: string | null;
};

/**
 * PRESENTATION AGGREGATION ONLY. A room move is two backend facts sharing a
 * correlation_id; there is no ROOM_CHANGED event and none is invented here.
 */
export function buildTimeline(
  events: HospitalityEventRow[],
  roomLabels: Record<string, string>,
  personByParticipation: Record<string, string>,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    if (seen.has(event.id)) continue;
    const pair =
      event.correlation_id &&
      (event.event_type === "ROOM_ASSIGNED" || event.event_type === "ROOM_RELEASED")
        ? events.find(
            (other) =>
              other.id !== event.id &&
              other.correlation_id === event.correlation_id &&
              (other.event_type === "ROOM_ASSIGNED" || other.event_type === "ROOM_RELEASED") &&
              other.event_type !== event.event_type,
          )
        : undefined;

    if (pair) {
      seen.add(event.id);
      seen.add(pair.id);
      const released = event.event_type === "ROOM_RELEASED" ? event : pair;
      const assigned = event.event_type === "ROOM_ASSIGNED" ? event : pair;
      items.push({
        id: assigned.id,
        occurred_at: assigned.occurred_at,
        kind: "move",
        event_type: "ROOM_ASSIGNED",
        note: assigned.note ?? released.note,
        from_label: released.room_id ? (roomLabels[released.room_id] ?? null) : null,
        to_label: assigned.room_id ? (roomLabels[assigned.room_id] ?? null) : null,
        person: assigned.stay_participation_id
          ? (personByParticipation[assigned.stay_participation_id] ?? null)
          : null,
      });
      continue;
    }

    seen.add(event.id);
    items.push({
      id: event.id,
      occurred_at: event.occurred_at,
      kind: "event",
      event_type: event.event_type,
      note: event.note,
      to_label: event.room_id ? (roomLabels[event.room_id] ?? null) : null,
      person: event.stay_participation_id
        ? (personByParticipation[event.stay_participation_id] ?? null)
        : null,
    });
  }

  return items;
}

/** IDEMPOTENCY: one intent = one key, stable across retries on a bad connection. */
export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}
