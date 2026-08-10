import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · W07 — Event Production Core.
 *
 * VENUE != EVENT · SPACE != VENUE · LIFECYCLE != RUNTIME.
 * Lifecycle (draft → planning → program_locked → ready → closed_out) is planning
 * governance. What actually happened is DERIVED from event_runtime_events only.
 * INTERNAL events are produced by the tenant; EXTERNAL events are only OBSERVED.
 * Speaker and staff assignment grant ZERO authorization and carry no attendance.
 */

export type VenueRow = Database["public"]["Tables"]["venues"]["Row"];
export type VenueSpaceRow = Database["public"]["Tables"]["venue_spaces"]["Row"];
export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type EventSessionRow = Database["public"]["Tables"]["event_sessions"]["Row"];
export type EventSpeakerRow = Database["public"]["Tables"]["event_session_speakers"]["Row"];
export type EventStaffRow = Database["public"]["Tables"]["event_staff_assignments"]["Row"];
export type EventRuntimeRow = Database["public"]["Tables"]["event_runtime_events"]["Row"];

export type EventLifecycleStatus = Database["public"]["Enums"]["event_lifecycle_status"];
export type EventSourceKind = Database["public"]["Enums"]["event_source_kind"];
export type EventSessionKind = Database["public"]["Enums"]["event_session_kind"];
export type EventStaffFunction = Database["public"]["Enums"]["event_staff_function"];
export type EventRuntimeEventType = Database["public"]["Enums"]["event_runtime_event_type"];

/** Runtime state is never stored — it mirrors the backend derivation exactly. */
export type EventRuntimeState = "scheduled" | "running" | "completed" | "cancelled";
export type SessionRuntimeState = "scheduled" | "running" | "paused" | "completed" | "cancelled";

export const SESSION_KINDS: EventSessionKind[] = [
  "keynote",
  "talk",
  "panel",
  "workshop",
  "ceremony",
  "performance",
  "rehearsal",
  "setup",
  "teardown",
  "break",
  "meal",
  "networking",
  "other",
];

export const STAFF_FUNCTIONS: EventStaffFunction[] = [
  "producer",
  "coordinator",
  "stage_manager",
  "technician",
  "audio",
  "lighting",
  "video",
  "photography",
  "host",
  "support",
  "logistics",
  "security",
  "other",
];

export const EVENT_STATUS_TONE: Record<EventLifecycleStatus, string> = {
  draft: "bg-elevated text-muted-foreground",
  planning: "bg-primary-soft text-primary",
  program_locked: "bg-warning-soft text-warning",
  ready: "bg-success-soft text-success",
  closed_out: "bg-elevated text-muted-foreground",
};

export const RUNTIME_STATE_TONE: Record<SessionRuntimeState, string> = {
  scheduled: "bg-elevated text-muted-foreground",
  running: "bg-success-soft text-success",
  paused: "bg-warning-soft text-warning",
  completed: "bg-primary-soft text-primary",
  cancelled: "bg-destructive/10 text-destructive",
};

export type ProgramSession = {
  session_id: string;
  sequence: number;
  title: string;
  description: string | null;
  session_kind: EventSessionKind;
  is_ad_hoc: boolean;
  ad_hoc_reason: string | null;
  venue_space_id: string | null;
  planned_start: string | null;
  planned_end: string | null;
  expected_start: string | null;
  expected_end: string | null;
  runtime_state: SessionRuntimeState;
};

export type EventProgram = {
  event_id: string;
  status: EventLifecycleStatus;
  program_locked: boolean;
  sessions: ProgramSession[];
};

export type EventRuntimeSnapshot = {
  event_id: string;
  status: EventLifecycleStatus;
  source_kind: EventSourceKind;
  runtime_state: EventRuntimeState;
  sessions: Array<{
    session_id: string;
    sequence: number;
    title: string;
    is_ad_hoc: boolean;
    venue_space_id: string | null;
    runtime_state: SessionRuntimeState;
  }>;
};

export type RuntimeFact = {
  id: string;
  event_type: EventRuntimeEventType;
  session_id: string | null;
  venue_space_id: string | null;
  observed: boolean;
  observed_at: string | null;
  observer_note: string | null;
  occurred_at: string;
  recorded_at: string;
  note: string | null;
  context: Record<string, unknown> | null;
  actor_profile_id: string | null;
};

export type RuntimeFeed = { event_id: string; facts: RuntimeFact[] };

export type SpaceAvailability = {
  venue_id: string;
  spaces: Array<{
    venue_space_id: string;
    name: string;
    is_active: boolean;
    planning_capacity: number | null;
    bookings: Array<{
      session_id: string;
      event_id: string;
      title: string;
      start: string | null;
      end: string | null;
    }>;
  }>;
};

/** A closed-out event is HISTORY ONLY — every mutation control disappears. */
export function isTerminalEvent(status: EventLifecycleStatus | null | undefined) {
  return status === "closed_out";
}

export function isTerminalSession(state: SessionRuntimeState) {
  return state === "completed" || state === "cancelled";
}

/** Mirrors the backend session transition matrix; illegal moves are never offered. */
export const SESSION_ACTIONS: Record<
  SessionRuntimeState,
  Array<"start" | "pause" | "resume" | "complete" | "cancel">
> = {
  scheduled: ["start", "cancel"],
  running: ["pause", "complete", "cancel"],
  paused: ["resume", "cancel"],
  completed: [],
  cancelled: [],
};

/** Observation is the only runtime surface for an external producer. */
export const OBSERVED_SESSION_ACTIONS: Record<SessionRuntimeState, Array<"start" | "complete">> = {
  scheduled: ["start"],
  running: ["complete"],
  paused: [],
  completed: [],
  cancelled: [],
};

export function currentSession(snapshot: EventRuntimeSnapshot | null) {
  if (!snapshot) return null;
  return (
    snapshot.sessions.find((s) => s.runtime_state === "running") ??
    snapshot.sessions.find((s) => s.runtime_state === "paused") ??
    null
  );
}

export function nextSession(snapshot: EventRuntimeSnapshot | null) {
  if (!snapshot) return null;
  return (
    [...snapshot.sessions]
      .sort((a, b) => a.sequence - b.sequence)
      .find((s) => s.runtime_state === "scheduled") ?? null
  );
}

/**
 * OBS-W07-001: an internal event only closes when every session derives to a
 * terminal state. Counters are DERIVED here exactly like the backend blocker —
 * nothing is persisted and no session is ever auto-resolved by the UI.
 */
export function sessionResolution(snapshot: EventRuntimeSnapshot | null) {
  const sessions = snapshot?.sessions ?? [];
  const count = (state: SessionRuntimeState) =>
    sessions.filter((s) => s.runtime_state === state).length;
  const scheduled = count("scheduled");
  const running = count("running");
  const paused = count("paused");
  return {
    total_sessions: sessions.length,
    completed_sessions: count("completed"),
    cancelled_sessions: count("cancelled"),
    scheduled_sessions: scheduled,
    running_sessions: running,
    paused_sessions: paused,
    unresolved_total: scheduled + running + paused,
    unresolved: sessions.filter((s) =>
      ["scheduled", "running", "paused"].includes(s.runtime_state),
    ),
  };
}


/**
 * DETERMINISTIC primary action. No scoring, no recommendation engine — just the
 * single legal next move derived from lifecycle plus runtime facts.
 */
export function primaryAction(
  event: EventRow | null,
  snapshot: EventRuntimeSnapshot | null,
): { key: string; kind: "event.start" | "event.complete" | "session.start" | "none" } {
  if (!event || !snapshot) return { key: "w07.action.none", kind: "none" };
  if (isTerminalEvent(event.status)) return { key: "w07.action.closed", kind: "none" };
  if (snapshot.runtime_state === "scheduled") {
    if (event.status !== "ready") return { key: "w07.action.prepare", kind: "none" };
    return {
      key: event.source_kind === "internal" ? "w07.action.startEvent" : "w07.action.observeStart",
      kind: "event.start",
    };
  }
  if (snapshot.runtime_state === "running") {
    const running = currentSession(snapshot);
    if (running) return { key: "w07.action.manageSession", kind: "none" };
    const upcoming = nextSession(snapshot);
    if (upcoming) {
      return {
        key:
          event.source_kind === "internal" ? "w07.action.startSession" : "w07.action.observeSession",
        kind: "session.start",
      };
    }
    return {
      key:
        event.source_kind === "internal" ? "w07.action.completeEvent" : "w07.action.observeComplete",
      kind: "event.complete",
    };
  }
  return { key: "w07.action.closed", kind: "none" };
}

/**
 * Delay attention is derived only from expected vs planned — W07 never invents
 * a metric and never rewrites Planned.
 */
export function sessionDelayMinutes(session: ProgramSession) {
  if (!session.planned_start || !session.expected_start) return 0;
  return Math.round(
    (new Date(session.expected_start).getTime() - new Date(session.planned_start).getTime()) / 60000,
  );
}

export function eventRuntimeLabel(type: EventRuntimeEventType, t: (key: string) => string) {
  return t(`w07.fact.${type}`);
}

/** IDEMPOTENCY: one intent = one key, stable across retries on a bad connection. */
export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

/** Drops undefined keys so optional RPC arguments stay absent, not explicit undefined. */
export function rpcArgs<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
