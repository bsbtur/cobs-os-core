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
export type PresenceEventRow = Database["public"]["Tables"]["participant_presence_events"]["Row"];
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

export const PRESENCE_CONTRACT: Record<StepKind, PresenceRequirement[]> = {
  meeting: ["accounted"],
  boarding: ["boarded"],
  movement: ["none"],
  arrival: ["none", "accounted"],
  disembarkation: ["accounted"],
  activity: ["none", "accounted"],
  meal: ["none"],
  hotel: ["none"],
  event: ["none"],
  break: ["none"],
  free_time: ["none"],
  return: ["none"],
  other: ["none"],
};

export function defaultPresenceRequirement(kind: StepKind): PresenceRequirement {
  if (kind === "boarding") return "boarded";
  if (kind === "meeting" || kind === "disembarkation") return "accounted";
  return "none";
}

export function allowedPresenceRequirements(kind: StepKind): PresenceRequirement[] {
  return PRESENCE_CONTRACT[kind];
}

export function isCanonicalPresence(kind: StepKind, requirement: PresenceRequirement): boolean {
  return PRESENCE_CONTRACT[kind].includes(requirement);
}

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

export function eventLabel(type: JourneyEventType, t: (key: string) => string) {
  return t(`w04.event.${type}`);
}

export function presenceLabel(fact: PresenceFact, t: (key: string) => string) {
  return t(`w04.presence.${fact}`);
}

/** Search names as operators type them: case, accents and surrounding spaces do not matter. */
export function normalizePersonSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function matchesPersonSearch(name: string | null | undefined, query: string): boolean {
  const normalizedQuery = normalizePersonSearch(query);
  return !normalizedQuery || normalizePersonSearch(name ?? "").includes(normalizedQuery);
}

export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}
