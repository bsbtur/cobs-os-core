/**
 * COBS OS · W10 — Traveler Portal client contract.
 *
 * BINDING RULES (W10-D/E):
 *  - The portal may ONLY call approved W10 public projections plus the
 *    already-approved W08 `mark_message_read` command.
 *  - No portal surface may read a W02–W09 domain table directly.
 *  - Every payload crossing into the UI passes through an EXPLICIT view-model
 *    mapper below. Never spread an RPC object into a component: a future
 *    backend field addition must not become an accidental UI disclosure.
 *  - Authorization is server-side. `denied` is a rendering state, never a gate.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/* Access failure                                                      */
/* ------------------------------------------------------------------ */

export type PortalFailure = "denied" | "unavailable";

export class PortalError extends Error {
  readonly kind: PortalFailure;
  constructor(kind: PortalFailure) {
    super(kind);
    this.name = "PortalError";
    this.kind = kind;
  }
}

/**
 * The backend answers every unauthorized projection with one uniform
 * "Access denied" message — no enumeration signal. Anything else is a
 * transport/availability problem and must never surface raw internals.
 */
export function toPortalError(error: unknown): PortalError {
  // PostgREST returns a plain object (not an Error), so read `message` defensively.
  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : String(error ?? "");
  return new PortalError(/access denied/i.test(message) ? "denied" : "unavailable");
}

export function isDenied(error: unknown): boolean {
  return error instanceof PortalError && error.kind === "denied";
}

/* ------------------------------------------------------------------ */
/* Safe primitive readers                                              */
/* ------------------------------------------------------------------ */

type Raw = Record<string, unknown>;

const obj = (value: unknown): Raw => (value && typeof value === "object" ? (value as Raw) : {});
const arr = (value: unknown): Raw[] => (Array.isArray(value) ? value.map(obj) : []);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const req = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number | null => (typeof value === "number" ? value : null);
const bool = (value: unknown): boolean => value === true;

/* ------------------------------------------------------------------ */
/* View models — the ONLY shapes the portal UI is allowed to see       */
/* ------------------------------------------------------------------ */

export type PortalOperationCard = {
  operationId: string;
  name: string;
  operationKind: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  historical: boolean;
};

export type PortalOverview = PortalOperationCard & {
  readOnly: boolean;
  myParticipationKind: string | null;
  myParticipationStatus: string | null;
};

export type PortalUpdate = { eventType: string; occurredAt: string | null; note: string | null };

export type PortalStep = {
  stepId: string;
  sequence: number | null;
  title: string;
  stepKind: string | null;
  locationLabel: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  updates: PortalUpdate[];
};

export type PortalStop = {
  sequence: number | null;
  label: string | null;
  isPickup: boolean;
  plannedTime: string | null;
  expectedTime: string | null;
};

export type PortalSeat = {
  seatLabel: string | null;
  assignedAt: string | null;
  releasedAt: string | null;
  active: boolean;
};

export type PortalLeg = {
  legId: string;
  sequence: number | null;
  title: string | null;
  legKind: string | null;
  originLabel: string | null;
  destinationLabel: string | null;
  plannedDeparture: string | null;
  expectedDeparture: string | null;
  plannedArrival: string | null;
  expectedArrival: string | null;
  returnTime: string | null;
  mySeat: PortalSeat | null;
  stops: PortalStop[];
};

export type PortalProperty = {
  name: string | null;
  propertyKind: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  addressLabel: string | null;
  timezone: string | null;
};

export type PortalRoom = {
  label: string | null;
  floorLabel: string | null;
  assignedAt: string | null;
  releasedAt: string | null;
  active: boolean;
};

export type PortalStay = {
  stayId: string;
  name: string | null;
  status: string | null;
  plannedCheckIn: string | null;
  expectedCheckIn: string | null;
  plannedCheckOut: string | null;
  expectedCheckOut: string | null;
  checkinOpen: boolean;
  property: PortalProperty | null;
  myRoom: PortalRoom[];
};

export type PortalSpace = { name: string | null; spaceLabel: string | null; floorLabel: string | null };

export type PortalSession = {
  sessionId: string;
  sequence: number | null;
  title: string | null;
  description: string | null;
  sessionKind: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  space: PortalSpace | null;
};

export type PortalVenue = {
  name: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  addressLabel: string | null;
  timezone: string | null;
};

export type PortalEvent = {
  eventId: string;
  name: string | null;
  sourceKind: string | null;
  externalProducerName: string | null;
  timezone: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  expectedStart: string | null;
  expectedEnd: string | null;
  closedOut: boolean;
  venue: PortalVenue | null;
  sessions: PortalSession[];
};

export type PortalMessage = {
  messageId: string;
  kind: string | null;
  priority: string | null;
  status: string | null;
  title: string | null;
  body: string | null;
  publishedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
  myFirstReadAt: string | null;
};

export type PortalGrant = {
  grantId: string;
  operationId: string;
  operationName: string | null;
  status: string | null;
  effective: boolean;
};

/* ------------------------------------------------------------------ */
/* Explicit mappers                                                    */
/* ------------------------------------------------------------------ */

function mapCard(raw: Raw): PortalOperationCard {
  return {
    operationId: req(raw["operation_id"]),
    name: req(raw["name"]),
    operationKind: str(raw["operation_kind"]),
    country: str(raw["primary_country"]),
    region: str(raw["primary_region"]),
    city: str(raw["primary_city"]),
    timezone: str(raw["timezone"]),
    plannedStart: str(raw["planned_start"]),
    plannedEnd: str(raw["planned_end"]),
    expectedStart: str(raw["expected_start"]),
    expectedEnd: str(raw["expected_end"]),
    historical: bool(raw["historical"]),
  };
}

function mapOverview(raw: Raw): PortalOverview {
  return {
    ...mapCard(raw),
    readOnly: bool(raw["read_only"]),
    myParticipationKind: str(raw["my_participation_kind"]),
    myParticipationStatus: str(raw["my_participation_status"]),
  };
}

function mapStep(raw: Raw): PortalStep {
  return {
    stepId: req(raw["step_id"]),
    sequence: num(raw["sequence"]),
    title: req(raw["title"]),
    stepKind: str(raw["step_kind"]),
    locationLabel: str(raw["location_label"]),
    plannedStart: str(raw["planned_start"]),
    plannedEnd: str(raw["planned_end"]),
    expectedStart: str(raw["expected_start"]),
    expectedEnd: str(raw["expected_end"]),
    updates: arr(raw["updates"]).map((u) => ({
      eventType: req(u["event_type"]),
      occurredAt: str(u["occurred_at"]),
      note: str(u["note"]),
    })),
  };
}

function mapLeg(raw: Raw): PortalLeg {
  const seat = raw["my_seat"] ? obj(raw["my_seat"]) : null;
  return {
    legId: req(raw["leg_id"]),
    sequence: num(raw["sequence"]),
    title: str(raw["title"]),
    legKind: str(raw["leg_kind"]),
    originLabel: str(raw["origin_label"]),
    destinationLabel: str(raw["destination_label"]),
    plannedDeparture: str(raw["planned_departure"]),
    expectedDeparture: str(raw["expected_departure"]),
    plannedArrival: str(raw["planned_arrival"]),
    expectedArrival: str(raw["expected_arrival"]),
    returnTime: str(raw["return_time"]),
    mySeat: seat
      ? {
          seatLabel: str(seat["seat_label"]),
          assignedAt: str(seat["assigned_at"]),
          releasedAt: str(seat["released_at"]),
          active: bool(seat["active"]),
        }
      : null,
    stops: arr(raw["stops"]).map((s) => ({
      sequence: num(s["sequence"]),
      label: str(s["label"]),
      isPickup: bool(s["is_pickup"]),
      plannedTime: str(s["planned_time"]),
      expectedTime: str(s["expected_time"]),
    })),
  };
}

function mapStay(raw: Raw): PortalStay {
  const property = raw["property"] ? obj(raw["property"]) : null;
  return {
    stayId: req(raw["stay_id"]),
    name: str(raw["name"]),
    status: str(raw["status"]),
    plannedCheckIn: str(raw["planned_check_in"]),
    expectedCheckIn: str(raw["expected_check_in"]),
    plannedCheckOut: str(raw["planned_check_out"]),
    expectedCheckOut: str(raw["expected_check_out"]),
    checkinOpen: bool(raw["checkin_open"]),
    property: property
      ? {
          name: str(property["name"]),
          propertyKind: str(property["property_kind"]),
          countryCode: str(property["country_code"]),
          region: str(property["region"]),
          city: str(property["city"]),
          addressLabel: str(property["address_label"]),
          timezone: str(property["timezone"]),
        }
      : null,
    myRoom: arr(raw["my_room"]).map((r) => ({
      label: str(r["label"]),
      floorLabel: str(r["floor_label"]),
      assignedAt: str(r["assigned_at"]),
      releasedAt: str(r["released_at"]),
      active: bool(r["active"]),
    })),
  };
}

function mapEvent(raw: Raw): PortalEvent {
  const venue = raw["venue"] ? obj(raw["venue"]) : null;
  return {
    eventId: req(raw["event_id"]),
    name: str(raw["name"]),
    sourceKind: str(raw["source_kind"]),
    externalProducerName: str(raw["external_producer_name"]),
    timezone: str(raw["timezone"]),
    plannedStart: str(raw["planned_start"]),
    plannedEnd: str(raw["planned_end"]),
    expectedStart: str(raw["expected_start"]),
    expectedEnd: str(raw["expected_end"]),
    closedOut: bool(raw["closed_out"]),
    venue: venue
      ? {
          name: str(venue["name"]),
          countryCode: str(venue["country_code"]),
          region: str(venue["region"]),
          city: str(venue["city"]),
          addressLabel: str(venue["address_label"]),
          timezone: str(venue["timezone"]),
        }
      : null,
    sessions: arr(raw["sessions"]).map((s) => {
      const space = s["space"] ? obj(s["space"]) : null;
      return {
        sessionId: req(s["session_id"]),
        sequence: num(s["sequence"]),
        title: str(s["title"]),
        description: str(s["description"]),
        sessionKind: str(s["session_kind"]),
        plannedStart: str(s["planned_start"]),
        plannedEnd: str(s["planned_end"]),
        expectedStart: str(s["expected_start"]),
        expectedEnd: str(s["expected_end"]),
        space: space
          ? {
              name: str(space["name"]),
              spaceLabel: str(space["space_label"]),
              floorLabel: str(space["floor_label"]),
            }
          : null,
      };
    }),
  };
}

function mapMessage(raw: Raw): PortalMessage {
  return {
    messageId: req(raw["message_id"]),
    kind: str(raw["kind"]),
    priority: str(raw["priority"]),
    status: str(raw["status"]),
    title: str(raw["title"]),
    body: str(raw["body"]),
    publishedAt: str(raw["published_at"]),
    cancelledAt: str(raw["cancelled_at"]),
    expiresAt: str(raw["expires_at"]),
    myFirstReadAt: str(raw["my_first_read_at"]),
  };
}

/* ------------------------------------------------------------------ */
/* Projection calls (W10 public read surface only)                     */
/* ------------------------------------------------------------------ */

async function callScoped(fn: "get_my_journey" | "get_my_mobility" | "get_my_stay" | "get_my_event_program" | "get_my_messages" | "get_my_operation_overview", operationId: string) {
  const { data, error } = await supabase.rpc(fn, { _operation_id: operationId });
  if (error) throw toPortalError(error);
  return obj(data);
}

export const portalKeys = {
  all: ["w10-portal"] as const,
  operations: () => ["w10-portal", "operations"] as const,
  access: () => ["w10-portal", "access"] as const,
  scoped: (operationId: string, surface: string) =>
    ["w10-portal", "operation", operationId, surface] as const,
};

const BASE = { retry: false, staleTime: 30_000, gcTime: 60_000, refetchOnWindowFocus: true } as const;

export function useMyOperations(): UseQueryResult<PortalOperationCard[], PortalError> {
  return useQuery({
    queryKey: portalKeys.operations(),
    ...BASE,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_operations");
      if (error) throw toPortalError(error);
      return arr(data).map(mapCard);
    },
  });
}

export function useMyAccess(): UseQueryResult<PortalGrant[], PortalError> {
  return useQuery({
    queryKey: portalKeys.access(),
    ...BASE,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_participant_access");
      if (error) throw toPortalError(error);
      return arr(data).map((g) => ({
        grantId: req(g["grant_id"]),
        operationId: req(g["operation_id"]),
        operationName: str(g["operation_name"]),
        status: str(g["status"]),
        effective: bool(g["effective"]),
      }));
    },
  });
}

export function useMyOverview(operationId: string): UseQueryResult<PortalOverview, PortalError> {
  return useQuery({
    queryKey: portalKeys.scoped(operationId, "overview"),
    ...BASE,
    queryFn: async () => mapOverview(await callScoped("get_my_operation_overview", operationId)),
  });
}

export function useMyJourney(
  operationId: string,
  enabled = true,
): UseQueryResult<PortalStep[], PortalError> {
  return useQuery({
    queryKey: portalKeys.scoped(operationId, "journey"),
    enabled,
    ...BASE,
    queryFn: async () => arr((await callScoped("get_my_journey", operationId))["steps"]).map(mapStep),
  });
}

export function useMyMobility(
  operationId: string,
  enabled = true,
): UseQueryResult<PortalLeg[], PortalError> {
  return useQuery({
    queryKey: portalKeys.scoped(operationId, "mobility"),
    enabled,
    ...BASE,
    queryFn: async () => arr((await callScoped("get_my_mobility", operationId))["legs"]).map(mapLeg),
  });
}

export function useMyStay(
  operationId: string,
  enabled = true,
): UseQueryResult<PortalStay[], PortalError> {
  return useQuery({
    queryKey: portalKeys.scoped(operationId, "stay"),
    enabled,
    ...BASE,
    queryFn: async () => arr((await callScoped("get_my_stay", operationId))["stays"]).map(mapStay),
  });
}

export function useMyEventProgram(
  operationId: string,
  enabled = true,
): UseQueryResult<PortalEvent[], PortalError> {
  return useQuery({
    queryKey: portalKeys.scoped(operationId, "events"),
    enabled,
    ...BASE,
    queryFn: async () =>
      arr((await callScoped("get_my_event_program", operationId))["events"]).map(mapEvent),
  });
}

export function useMyMessages(
  operationId: string,
  enabled = true,
): UseQueryResult<PortalMessage[], PortalError> {
  return useQuery({
    queryKey: portalKeys.scoped(operationId, "messages"),
    enabled,
    ...BASE,
    queryFn: async () =>
      arr((await callScoped("get_my_messages", operationId))["messages"]).map(mapMessage),
  });
}

/* ------------------------------------------------------------------ */
/* Now / Next derivation — traveler-facing timing only                 */
/* ------------------------------------------------------------------ */

export type PortalAgendaItem = {
  id: string;
  source: "journey" | "event" | "mobility";
  title: string;
  detail: string | null;
  start: string | null;
  end: string | null;
};

function effective(planned: string | null, expected: string | null) {
  return expected ?? planned;
}

export function buildAgenda(
  steps: PortalStep[],
  legs: PortalLeg[],
  events: PortalEvent[],
): PortalAgendaItem[] {
  const items: PortalAgendaItem[] = [];
  for (const s of steps) {
    items.push({
      id: `step:${s.stepId}`,
      source: "journey",
      title: s.title,
      detail: s.locationLabel,
      start: effective(s.plannedStart, s.expectedStart),
      end: effective(s.plannedEnd, s.expectedEnd),
    });
  }
  for (const l of legs) {
    items.push({
      id: `leg:${l.legId}`,
      source: "mobility",
      title: l.title ?? l.destinationLabel ?? "",
      detail: l.originLabel && l.destinationLabel ? `${l.originLabel} → ${l.destinationLabel}` : null,
      start: effective(l.plannedDeparture, l.expectedDeparture),
      end: effective(l.plannedArrival, l.expectedArrival),
    });
  }
  for (const e of events) {
    for (const s of e.sessions) {
      items.push({
        id: `session:${s.sessionId}`,
        source: "event",
        title: s.title ?? e.name ?? "",
        detail: s.space?.name ?? e.venue?.name ?? null,
        start: effective(s.plannedStart, s.expectedStart),
        end: effective(s.plannedEnd, s.expectedEnd),
      });
    }
  }
  return items
    .filter((i) => i.start !== null)
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());
}

export function splitNowNext(agenda: PortalAgendaItem[], at: number = Date.now()) {
  const now =
    agenda.find((i) => {
      const start = i.start ? new Date(i.start).getTime() : null;
      const end = i.end ? new Date(i.end).getTime() : null;
      if (start === null) return false;
      return start <= at && (end === null ? at - start < 3 * 3600_000 : at <= end);
    }) ?? null;
  const next = agenda.find((i) => i.start !== null && new Date(i.start).getTime() > at) ?? null;
  return { now, next };
}
