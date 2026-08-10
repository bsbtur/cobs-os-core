import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · W04 — Journey · Live runtime · Presence · Playbooks (client model).
 *
 * PLANNED != EXPECTED != ACTUAL — actual state is derived from runtime facts only.
 * ROSTER != PRESENCE — W03 participation status is never written by W04.
 * READINESS is derived; there is no ready flag anywhere.
 * JOURNEY != MOBILITY / HOSPITALITY / EVENT RUNTIME — those domains own their own truth.
 */

export type JourneyStepRow = Database["public"]["Tables"]["journey_steps"]["Row"];
export type JourneyEventRow = Database["public"]["Tables"]["journey_events"]["Row"];
export type PresenceEventRow =
  Database["public"]["Tables"]["participant_presence_events"]["Row"];
export type PlaybookItemRow = Database["public"]["Tables"]["playbook_items"]["Row"];
export type PlaybookExecutionRow = Database["public"]["Tables"]["playbook_executions"]["Row"];

export type StepKind = Database["public"]["Enums"]["journey_step_kind"];
export type JourneyEventType = Database["public"]["Enums"]["journey_event_type"];
export type PresenceFact = Database["public"]["Enums"]["presence_fact"];
export type PlaybookRequirement = Database["public"]["Enums"]["playbook_requirement"];
export type PlaybookItemKind = Database["public"]["Enums"]["playbook_item_kind"];
export type PresenceRequirement = Database["public"]["Enums"]["step_presence_requirement"];
export type PresencePopulation = Database["public"]["Enums"]["step_presence_population"];
export type PlanOrigin = Database["public"]["Enums"]["step_plan_origin"];

export const STEP_KINDS: StepKind[] = [
  "meeting",
  "boarding",
  "movement",
  "arrival",
  "disembarkation",
  "activity",
  "meal",
  "hotel",
  "event",
  "break",
  "free_time",
  "return",
  "other",
];

export const PRESENCE_REQUIREMENTS: PresenceRequirement[] = ["none", "accounted", "boarded"];
export const PRESENCE_POPULATIONS: PresencePopulation[] = ["participants", "all_confirmed"];
export const PLAYBOOK_REQUIREMENTS: PlaybookRequirement[] = [
  "required",
  "recommended",
  "informational",
];

/** Mirrors app_private.w04_default_presence_requirement — the UI proposes what the DB would. */
export function defaultPresenceRequirement(kind: StepKind): PresenceRequirement {
  if (kind === "boarding" || kind === "movement" || kind === "return") return "boarded";
  if (kind === "meeting" || kind === "arrival" || kind === "disembarkation") return "accounted";
  return "none";
}

/**
 * BINDING READINESS RULE (server is authoritative; this mirrors it for display only).
 * ABSENCE_NOTED never satisfies readiness. DISEMBARKED counts as accounted.
 */
export const SATISFYING_FACTS: Record<PresenceRequirement, PresenceFact[]> = {
  none: [],
  accounted: ["PRESENT_AT_MEETING_POINT", "BOARDED", "DISEMBARKED", "NO_SHOW_CONFIRMED"],
  boarded: ["BOARDED", "NO_SHOW_CONFIRMED"],
};

export type Readiness = {
  step_id: string;
  requirement: PresenceRequirement;
  population: PresencePopulation;
  evaluated: number;
  satisfied: number;
  missing_participations: Array<{
    participation_id: string;
    full_name: string;
    latest_fact: PresenceFact | null;
  }>;
  missing_required_items: Array<{ id: string; title: string }>;
  presence_ok: boolean;
  checklist_ok: boolean;
  ready: boolean;
};

export type RuntimeState = {
  operation_id: string;
  status: Database["public"]["Enums"]["operation_status"];
  current_step_id: string | null;
  next_step_id: string | null;
  readiness: Readiness | null;
};

/** Raw enums never reach the interface — every fact is humanized through i18n. */
export function eventLabel(type: JourneyEventType, t: (key: string) => string) {
  return t(`w04.event.${type}`);
}

export function presenceLabel(fact: PresenceFact, t: (key: string) => string) {
  return t(`w04.presence.${fact}`);
}

/** IDEMPOTENCY: one intent = one key, stable across retries on a bad connection. */
export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}
