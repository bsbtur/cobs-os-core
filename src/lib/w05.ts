import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · W05 — Mobility core (vehicles · drivers · transport legs · dispatch · seats).
 *
 * JOURNEY != MOBILITY — W04 owns BOARDED / DISEMBARKED / DEPARTURE_AUTHORIZED / group ARRIVED.
 * W05 owns dispatch, vehicle movement, legs, stops, seats and DESTINATION_ARRIVED.
 * PERSON IS CANONICAL — a driver is a resource pointing at a Person, never a second identity.
 * PLANNED != EXPECTED != ACTUAL — actual times are derived from append-only transport facts.
 * NO TRACKING — operator-authored labels only; there are no coordinates anywhere in W05.
 */

export type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];
export type DriverRow = Database["public"]["Tables"]["drivers"]["Row"];
export type TransportLegRow = Database["public"]["Tables"]["transport_legs"]["Row"];
export type TransportStopRow = Database["public"]["Tables"]["transport_leg_stops"]["Row"];
export type TransportEventRow = Database["public"]["Tables"]["transport_events"]["Row"];
export type SeatAssignmentRow =
  Database["public"]["Tables"]["transport_seat_assignments"]["Row"];

export type VehicleKind = Database["public"]["Enums"]["transport_vehicle_kind"];
export type LegKind = Database["public"]["Enums"]["transport_leg_kind"];
export type TransportEventType = Database["public"]["Enums"]["transport_event_type"];
export type DispatchState = Database["public"]["Enums"]["transport_dispatch_state"];

export const VEHICLE_KINDS: VehicleKind[] = [
  "bus",
  "minibus",
  "van",
  "car",
  "boat",
  "shuttle",
  "other",
];

export const LEG_KINDS: LegKind[] = ["outbound", "transfer", "shuttle", "return", "other"];

/** Seat eligibility mirrors app_private.w05_seat_eligible — the server stays authoritative. */
export const SEAT_ELIGIBLE_KINDS = ["participant", "crew", "support"] as const;

export type LegDispatchState = {
  transport_leg_id: string;
  dispatch_state: DispatchState;
  planned_departure: string | null;
  planned_arrival: string | null;
  expected_departure: string | null;
  expected_arrival: string | null;
  /** DERIVED from facts. There is no actual_* column anywhere. */
  actual_departure: string | null;
  actual_arrival: string | null;
  return_time: string | null;
  departure_delay_minutes: number | null;
  arrival_delay_minutes: number | null;
  vehicle_id: string | null;
  driver_id: string | null;
  seats_taken: number;
  capacity: number | null;
  requested_at: string | null;
  en_route_at: string | null;
  at_pickup_at: string | null;
  cancelled_at: string | null;
};

export type LegManifest = {
  transport_leg_id: string;
  seated: Array<{
    seat_assignment_id: string;
    participation_id: string;
    person_id: string;
    full_name: string;
    participation_kind: string;
    participation_status: string;
    seat_label: string | null;
    assigned_at: string;
    still_eligible: boolean;
  }>;
  /** Released seats are never deleted — the history stays readable. */
  released_history: Array<{
    seat_assignment_id: string;
    participation_id: string;
    full_name: string;
    seat_label: string | null;
    assigned_at: string;
    released_at: string;
    release_reason: string | null;
  }>;
  stops: Array<{
    transport_leg_stop_id: string;
    sequence: number;
    label: string;
    is_pickup: boolean;
    planned_time: string | null;
    expected_time: string | null;
    reached_at: string | null;
  }>;
};

export type SeatCandidates = {
  transport_leg_id: string;
  candidates: Array<{
    participation_id: string;
    person_id: string;
    full_name: string;
    participation_kind: string;
    status: string;
  }>;
};

export type OperationMobility = {
  operation_id: string;
  legs: Array<{
    transport_leg_id: string;
    sequence: number;
    title: string;
    leg_kind: LegKind;
    plan_origin: "planned" | "ad_hoc";
    journey_step_id: string | null;
    origin_label: string | null;
    destination_label: string | null;
    vehicle_label: string | null;
    driver_name: string | null;
    state: LegDispatchState;
  }>;
};

/** Raw enums never reach the interface. */
export function dispatchLabel(state: DispatchState, t: (key: string) => string) {
  return t(`w05.state.${state}`);
}

export function transportEventLabel(type: TransportEventType, t: (key: string) => string) {
  return t(`w05.event.${type}`);
}

export const DISPATCH_TONE: Record<DispatchState, string> = {
  planned: "bg-elevated text-muted-foreground",
  requested: "bg-primary-soft text-primary",
  assigned: "bg-primary-soft text-primary",
  en_route_to_pickup: "bg-warning-soft text-warning",
  at_pickup: "bg-warning-soft text-warning",
  in_transit: "bg-success-soft text-success",
  arrived: "bg-success-soft text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

/** IDEMPOTENCY: one intent = one key, stable across retries on a bad connection. */
export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}
