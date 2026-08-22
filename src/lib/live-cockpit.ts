import { SATISFYING_FACTS, type JourneyStepRow, type PresenceFact, type Readiness } from "./w04";

/**
 * COBS OS · V1.1 — Live cockpit derivation (PURE, DISPLAY ONLY).
 *
 * This module never writes, never queries and never replaces a backend guard:
 * it only orders what the operator already sees into a single next action.
 * Every branch is derived from facts already loaded by the Live route.
 */

export type CockpitFlags = {
  boardingStarted: boolean;
  boardingCompleted: boolean;
  departureAuthorized: boolean;
  departed: boolean;
  arrived: boolean;
  disembarked: boolean;
};

export const EMPTY_FLAGS: CockpitFlags = {
  boardingStarted: false,
  boardingCompleted: false,
  departureAuthorized: false,
  departed: false,
  arrived: false,
  disembarked: false,
};

export type CockpitActionId =
  | "start_step"
  | "resolve_people"
  | "start_boarding"
  | "confirm_boarding"
  | "complete_boarding"
  | "authorize_departure"
  | "record_departed"
  | "record_arrival"
  | "complete_disembarkation"
  | "complete_step"
  | "start_next_step"
  | "complete_operation";

/** How the CTA is executed. The frontend only orients; the server still decides. */
export type CockpitActionMode = "rpc" | "focus" | "navigate";

export type CockpitAction = {
  id: CockpitActionId;
  mode: CockpitActionMode;
  /** RPC name when mode = "rpc" — always one of the already-deployed W04 commands. */
  fn?: string;
  /** Step the RPC targets (current step, or the next one when starting it). */
  targetStepId?: string;
  labelKey: string;
  /** True when readiness or a runtime precondition would make the server refuse. */
  blocked: boolean;
  reasonKey?: string | undefined;
};

export type CockpitTone = "neutral" | "ready" | "blocked" | "attention" | "late";

const ATTENTION_WINDOW_MS = 15 * 60_000;

function timeOf(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : null;
}

export function stepStart(step: JourneyStepRow | null): number | null {
  return timeOf(step?.expected_start ?? step?.planned_start ?? null);
}

export function stepEnd(step: JourneyStepRow | null): number | null {
  return timeOf(step?.expected_end ?? step?.planned_end ?? null);
}

/** Steps whose completion the backend gates behind an ARRIVED fact (DEF-PILOT-023/025). */
export function requiresArrival(step: JourneyStepRow): boolean {
  return (
    step.step_kind === "movement" ||
    step.step_kind === "return" ||
    step.step_kind === "disembarkation"
  );
}

/** Steps where recording ARRIVED is part of the runtime at all. */
export function acceptsArrival(step: JourneyStepRow): boolean {
  return requiresArrival(step) || step.step_kind === "arrival";
}

export function deriveTone(input: {
  current: JourneyStepRow | null;
  readiness: Readiness | null;
  now: number;
}): CockpitTone {
  const { current, readiness, now } = input;
  if (!current) return "neutral";
  const end = stepEnd(current);
  if (end !== null && now > end) return "late";
  if (readiness && !readiness.ready) return "blocked";
  if (end !== null && end - now <= ATTENTION_WINDOW_MS) return "attention";
  if (readiness?.ready) return "ready";
  return "neutral";
}

/** Accumulated delay in ms when the step window is already over, otherwise null. */
export function deriveDelayMs(current: JourneyStepRow | null, now: number): number | null {
  const end = stepEnd(current);
  if (end === null || now <= end) return null;
  return now - end;
}

/**
 * NEXT ACTION MACHINE — strict priority order.
 * Returns null only when there is nothing left to orient towards.
 */
export function deriveNextAction(input: {
  current: JourneyStepRow | null;
  next: JourneyStepRow | null;
  readiness: Readiness | null;
  flags: CockpitFlags;
  journeyResolved: boolean;
}): CockpitAction | null {
  const { current, next, readiness, flags, journeyResolved } = input;

  // 1 / 10 / 11 — nothing running right now.
  if (!current) {
    if (next) {
      return {
        id: "start_next_step",
        mode: "rpc",
        fn: "start_journey_step",
        targetStepId: next.id,
        labelKey: "w04.action.startStep",
        blocked: false,
      };
    }
    if (journeyResolved) {
      return {
        id: "complete_operation",
        mode: "navigate",
        labelKey: "w04.cockpit.action.completeOperation",
        blocked: false,
      };
    }
    return null;
  }

  const ready = readiness?.ready ?? true;
  const presencePending = readiness ? !readiness.presence_ok : false;
  const isBoarding = current.presence_requirement === "boarded";

  // 3 — boarding step whose boarding window is not open yet.
  if (isBoarding && !flags.boardingStarted) {
    return {
      id: "start_boarding",
      mode: "rpc",
      fn: "start_boarding",
      targetStepId: current.id,
      labelKey: "w04.action.startBoarding",
      blocked: false,
    };
  }

  // 2 / 4 — people still unresolved for this step.
  if (presencePending) {
    return {
      id: isBoarding ? "confirm_boarding" : "resolve_people",
      mode: "focus",
      labelKey: isBoarding
        ? "w04.cockpit.action.confirmBoarding"
        : "w04.cockpit.action.resolvePeople",
      blocked: false,
      reasonKey: "w04.cockpit.reason.peoplePending",
    };
  }

  if (isBoarding) {
    if (!flags.boardingCompleted) {
      return {
        id: "complete_boarding",
        mode: "rpc",
        fn: "complete_boarding",
        targetStepId: current.id,
        labelKey: "w04.action.completeBoarding",
        blocked: !ready,
        reasonKey: ready ? undefined : "w04.cockpit.reason.notReady",
      };
    }
    // 5 — people resolved, departure not authorized yet.
    if (!flags.departureAuthorized) {
      return {
        id: "authorize_departure",
        mode: "rpc",
        fn: "authorize_departure",
        targetStepId: current.id,
        labelKey: "w04.action.authorizeDeparture",
        blocked: !ready,
        reasonKey: ready ? undefined : "w04.cockpit.reason.notReady",
      };
    }
    // 6 — authorized but the group has not left.
    if (!flags.departed) {
      return {
        id: "record_departed",
        mode: "rpc",
        fn: "record_departed",
        targetStepId: current.id,
        labelKey: "w04.action.departed",
        blocked: false,
      };
    }
  }

  // 7 — movement underway without ARRIVED.
  if (acceptsArrival(current) && !flags.arrived) {
    return {
      id: "record_arrival",
      mode: "rpc",
      fn: "record_arrival",
      targetStepId: current.id,
      labelKey: "w04.action.arrived",
      blocked: false,
    };
  }

  // 8 — arrived, disembarkation still open.
  if (current.step_kind === "disembarkation" && !flags.disembarked) {
    return {
      id: "complete_disembarkation",
      mode: "rpc",
      fn: "complete_disembarkation",
      targetStepId: current.id,
      labelKey: "w04.action.disembarked",
      blocked: !ready,
      reasonKey: ready ? undefined : "w04.cockpit.reason.notReady",
    };
  }

  // 9 — everything satisfied: close the step.
  const arrivalMissing = requiresArrival(current) && !flags.arrived;
  return {
    id: "complete_step",
    mode: "rpc",
    fn: "complete_journey_step",
    targetStepId: current.id,
    labelKey: "w04.action.completeStep",
    blocked: !ready || arrivalMissing,
    reasonKey: arrivalMissing
      ? "w04.cockpit.reason.arrivalMissing"
      : ready
        ? undefined
        : "w04.cockpit.reason.notReady",
  };
}

/* ------------------------------------------------------------------ */
/* Step summary                                                        */
/* ------------------------------------------------------------------ */

export type SummaryRoster = {
  id: string;
  participation_kind: string;
  status: string;
};

export type SummaryPresence = {
  id: string;
  participation_id: string;
  journey_step_id: string | null;
  presence_fact: string;
  retracts_presence_event_id: string | null;
  occurred_at: string;
};

export type CockpitSummary = {
  population: number;
  present: number;
  boarded: number;
  pending: number;
  absent: number;
};

/**
 * Counts for the current step, derived exactly like the presence panel:
 * only non-retracted effective facts count, and only confirmed roster rows.
 *
 * Visual summary contract (post V1.1 review):
 * - present = physical/resolved positive presence only:
 *   PRESENT_AT_MEETING_POINT, BOARDED, DISEMBARKED.
 * - boarded = only BOARDED.
 * - absent = ABSENCE_NOTED or NO_SHOW_CONFIRMED.
 * - pending = still not resolved for the step requirement (readiness logic),
 *   but NO_SHOW_CONFIRMED is considered resolved, never counted as present.
 */

export function summarizeStepPresence(
  step: JourneyStepRow,
  roster: SummaryRoster[],
  presence: SummaryPresence[],
): CockpitSummary {
  const retracted = new Set(
    presence
      .map((event) => event.retracts_presence_event_id)
      .filter((id): id is string => Boolean(id)),
  );

  const relevant = roster.filter((row) =>
    step.presence_population === "participants" ? row.participation_kind === "participant" : true,
  );

  const effectiveFor = (participationId: string): string | null => {
    const rows = presence
      .filter(
        (event) =>
          event.participation_id === participationId &&
          event.journey_step_id === step.id &&
          event.presence_fact !== "PRESENCE_RETRACTED" &&
          !retracted.has(event.id),
      )
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
    return rows[0]?.presence_fact ?? null;
  };

  const satisfying = SATISFYING_FACTS[step.presence_requirement] as string[];
  const POSITIVE_PRESENCE_FACTS: readonly string[] = [
    "PRESENT_AT_MEETING_POINT",
    "BOARDED",
    "DISEMBARKED",
  ];
  let present = 0;
  let boarded = 0;
  let absent = 0;
  let pending = 0;

  for (const row of relevant) {
    const fact = row.status === "confirmed" ? effectiveFor(row.id) : null;
    if (fact === "BOARDED") boarded += 1;
    if (fact === "ABSENCE_NOTED" || fact === "NO_SHOW_CONFIRMED") absent += 1;
    if (fact && POSITIVE_PRESENCE_FACTS.includes(fact)) present += 1;

    const resolved = fact && satisfying.includes(fact as PresenceFact);
    if (!resolved) pending += 1;
  }

  return { population: relevant.length, present, boarded, pending, absent };
}
