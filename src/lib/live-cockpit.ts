import type { JourneyStepRow, PresenceEventRow, PresenceFact, Readiness } from "@/lib/w04";
import { SATISFYING_FACTS } from "@/lib/w04";

/**
 * COBS OS · V1.1 — Operational Cockpit (pure helper, display only).
 *
 * Derives the NEXT ACTION, the operational tone, the delay and the step summary
 * from data the live route already loaded. It writes nothing, queries nothing and
 * never overrides a server guard: every CTA maps to an existing W04 command that
 * the backend is still free to refuse.
 */

export type CockpitTone = "ready" | "attention" | "blocked" | "delayed" | "neutral";

export type CockpitActionKey =
  | "operationNotActive"
  | "startStep"
  | "startGathering"
  | "startBoarding"
  | "resolvePresence"
  | "resolveChecklist"
  | "completeBoarding"
  | "authorizeDeparture"
  | "recordDeparted"
  | "recordArrival"
  | "completeDisembarkation"
  | "completeStep"
  | "completeOperation"
  | "waiting";

export type CockpitAction = {
  key: CockpitActionKey;
  /** Existing W04 RPC to call, when the action is a direct command. */
  rpc: string | null;
  /** DOM anchor to scroll to, when the action is a human resolution. */
  anchor: string | null;
  /** True when the server would currently refuse the gated command. */
  blocked: boolean;
  /** Optional existing i18n key used when a dedicated cockpit sentence is not needed. */
  labelKey?: string;
  /** Optional existing i18n key for the CTA. */
  ctaKey?: string;
};

export type CockpitDelay = {
  state: "unknown" | "early" | "running" | "late";
  /** Positive milliseconds of lateness (0 when not late). */
  lateMs: number;
};

export type StepPresenceSummary = {
  population: number;
  present: number;
  boarded: number;
  absent: number;
  pending: number;
};

/** Facts that represent a positive, physical presence resolution. */
const PHYSICAL_PRESENT_FACTS: PresenceFact[] = [
  "PRESENT_AT_MEETING_POINT",
  "BOARDED",
  "DISEMBARKED",
];

/** Facts that represent a resolved absence. */
const ABSENT_FACTS: PresenceFact[] = ["ABSENCE_NOTED", "NO_SHOW_CONFIRMED"];

type RosterLike = { id: string; participation_kind: string; status: string };

/** Ids of presence events that carry a retraction — no longer effective. */
function retractedIds(presence: PresenceEventRow[]): Set<string> {
  const set = new Set<string>();
  for (const event of presence) {
    if (event.retracts_presence_event_id) set.add(event.retracts_presence_event_id);
  }
  return set;
}

/** Latest effective (non-retracted, non-marker) fact for a participation on a step. */
export function effectivePresenceFact(
  presence: PresenceEventRow[],
  stepId: string,
  participationId: string,
): PresenceFact | null {
  const retracted = retractedIds(presence);
  const rows = presence
    .filter(
      (event) =>
        event.participation_id === participationId &&
        event.journey_step_id === stepId &&
        event.presence_fact !== "PRESENCE_RETRACTED" &&
        !retracted.has(event.id),
    )
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  return (rows[0]?.presence_fact as PresenceFact | undefined) ?? null;
}

/**
 * VISUAL SUMMARY CONTRACT (V1.1).
 * present  → only PRESENT_AT_MEETING_POINT, BOARDED, DISEMBARKED
 * boarded  → only BOARDED
 * absent   → ABSENCE_NOTED, NO_SHOW_CONFIRMED
 * pending  → has not yet satisfied the step requirement (readiness logic).
 * NO_SHOW_CONFIRMED may resolve readiness, but is never shown as present.
 */
export function summarizeStepPresence(input: {
  step: JourneyStepRow;
  roster: RosterLike[];
  presence: PresenceEventRow[];
}): StepPresenceSummary {
  const { step, roster, presence } = input;
  const relevant = roster.filter((row) =>
    step.presence_population === "participants" ? row.participation_kind === "participant" : true,
  );
  const satisfying = SATISFYING_FACTS[step.presence_requirement];

  let present = 0;
  let boarded = 0;
  let absent = 0;
  let pending = 0;

  for (const row of relevant) {
    const fact = effectivePresenceFact(presence, step.id, row.id);
    if (fact && PHYSICAL_PRESENT_FACTS.includes(fact)) present += 1;
    if (fact === "BOARDED") boarded += 1;
    if (fact && ABSENT_FACTS.includes(fact)) absent += 1;

    // Readiness mirror: only confirmed people count, and only satisfying facts resolve.
    const resolved = row.status === "confirmed" && Boolean(fact && satisfying.includes(fact));
    if (!resolved) pending += 1;
  }

  return { population: relevant.length, present, boarded, absent, pending };
}

function timeOf(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : null;
}

/** Delay of the current step, derived from expected_* falling back to planned_*. */
export function computeStepDelay(step: JourneyStepRow | null, now: number): CockpitDelay {
  if (!step) return { state: "unknown", lateMs: 0 };
  const start = timeOf(step.expected_start ?? step.planned_start);
  const end = timeOf(step.expected_end ?? step.planned_end);
  if (end !== null && now > end) return { state: "late", lateMs: now - end };
  if (start !== null && now < start) return { state: "early", lateMs: 0 };
  if (start !== null || end !== null) return { state: "running", lateMs: 0 };
  return { state: "unknown", lateMs: 0 };
}

export type CockpitInput = {
  operationStatus: string | null;
  current: JourneyStepRow | null;
  next: JourneyStepRow | null;
  readiness: Readiness | null;
  arrived: boolean;
  boardingStarted: boolean;
  gatheringStarted?: boolean;
  boardingCompleted?: boolean;
  departureAuthorized?: boolean;
  departed?: boolean;
  disembarkationCompleted?: boolean;
  journeyResolved: boolean;
};

/**
 * NEXT ACTION MACHINE — first matching rule wins.
 *
 * UX invariant: the live screen exposes exactly one operational next action.
 * Past commands remain visible only as disabled history in the secondary action strip.
 * Server guards stay authoritative; this helper is intentionally at least as conservative.
 */
export function deriveNextAction(input: CockpitInput): CockpitAction {
  const {
    operationStatus,
    current,
    next,
    readiness,
    arrived,
    boardingStarted,
    gatheringStarted = false,
    boardingCompleted = false,
    departureAuthorized = false,
    departed = false,
    disembarkationCompleted = false,
    journeyResolved,
  } = input;

  if (operationStatus !== "active") {
    return { key: "operationNotActive", rpc: null, anchor: null, blocked: true };
  }

  if (!current) {
    if (next) return { key: "startStep", rpc: "start_journey_step", anchor: null, blocked: false };
    if (journeyResolved) {
      return { key: "completeOperation", rpc: null, anchor: null, blocked: false };
    }
    return { key: "waiting", rpc: null, anchor: null, blocked: false };
  }

  // Opening commands establish the operational context before human confirmations.
  if (current.step_kind === "meeting" && !gatheringStarted) {
    return { key: "startGathering", rpc: "start_gathering", anchor: null, blocked: false };
  }

  if (current.presence_requirement === "boarded" && !boardingStarted) {
    return { key: "startBoarding", rpc: "start_boarding", anchor: null, blocked: false };
  }

  const notReady = readiness ? !readiness.ready : false;

  // Disembarkation has a server-enforced arrival prerequisite for DISEMBARKED facts.
  // Arrival must therefore be recorded before presence readiness is evaluated, otherwise
  // the cockpit deadlocks: readiness asks for DISEMBARKED while DISEMBARKED requires ARRIVED.
  if (current.step_kind === "disembarkation" && !arrived) {
    return { key: "recordArrival", rpc: "record_arrival", anchor: null, blocked: false };
  }

  // In field UX, required checklist is resolved before presence and before advancing commands.
  if (notReady && (readiness?.missing_required_items.length ?? 0) > 0) {
    return { key: "resolveChecklist", rpc: null, anchor: "cockpit-checklist", blocked: true };
  }
  if (notReady && (readiness?.missing_participations.length ?? 0) > 0) {
    return { key: "resolvePresence", rpc: null, anchor: "cockpit-people", blocked: true };
  }

  // Boarding is deliberately linear: open → confirm people/checklist → close → authorize → depart.
  if (current.presence_requirement === "boarded") {
    if (!boardingCompleted) {
      return {
        key: "completeBoarding",
        rpc: "complete_boarding",
        anchor: null,
        blocked: notReady,
        labelKey: "w04.action.completeBoarding",
        ctaKey: "w04.action.completeBoarding",
      };
    }
    if (!departureAuthorized) {
      return {
        key: "authorizeDeparture",
        rpc: "authorize_departure",
        anchor: null,
        blocked: false,
        labelKey: "w04.action.authorizeDeparture",
        ctaKey: "w04.action.authorizeDeparture",
      };
    }
    if (!departed) {
      return {
        key: "recordDeparted",
        rpc: "record_departed",
        anchor: null,
        blocked: false,
        labelKey: "w04.action.departed",
        ctaKey: "w04.action.departed",
      };
    }
  }

  const needsArrival =
    current.step_kind === "movement" ||
    current.step_kind === "arrival" ||
    current.step_kind === "return";
  if (needsArrival && !arrived) {
    return { key: "recordArrival", rpc: "record_arrival", anchor: null, blocked: false };
  }

  if (current.step_kind === "disembarkation" && !disembarkationCompleted) {
    return {
      key: "completeDisembarkation",
      rpc: "complete_disembarkation",
      anchor: null,
      blocked: notReady || !arrived,
    };
  }

  return {
    key: "completeStep",
    rpc: "complete_journey_step",
    anchor: null,
    blocked: notReady,
  };
}

/** Operational tone: BLOQUEADO > ATRASADO > ATENÇÃO > PRONTO. */
export function deriveTone(input: {
  action: CockpitAction;
  delay: CockpitDelay;
  summary: StepPresenceSummary | null;
  operationStatus: string | null;
}): CockpitTone {
  const { action, delay, summary, operationStatus } = input;
  if (operationStatus !== "active") return "neutral";
  if (action.blocked) return "blocked";
  if (delay.state === "late") return "delayed";
  if (summary && (summary.pending > 0 || summary.absent > 0)) return "attention";
  return "ready";
}
