import type { Database } from "@/integrations/supabase/types";

export type JourneyStepRow = Database["public"]["Tables"]["journey_steps"]["Row"];
export type PlaybookItemRow = Database["public"]["Tables"]["playbook_items"]["Row"];
export type PlaybookRequirement = Database["public"]["Enums"]["playbook_requirement"];
export type PresencePopulation = Database["public"]["Enums"]["presence_population"];
export type PresenceRequirement = Database["public"]["Enums"]["presence_requirement"];
export type StepKind = Database["public"]["Enums"]["journey_step_kind"];

export const STEP_KINDS: StepKind[] = [
  "meeting",
  "boarding",
  "departure",
  "arrival",
  "visit",
  "activity",
  "meal",
  "check_in",
  "check_out",
  "disembarkation",
  "free_time",
  "transfer",
  "other",
];

export const PRESENCE_POPULATIONS: PresencePopulation[] = ["participants", "team", "all"];
export const PLAYBOOK_REQUIREMENTS: PlaybookRequirement[] = ["required", "recommended", "informational"];

const CANONICAL_PRESENCE: Partial<Record<StepKind, PresenceRequirement>> = {
  meeting: "accounted",
  boarding: "boarded",
  departure: "boarded",
  arrival: "arrived",
  disembarkation: "disembarked",
};

export function allowedPresenceRequirements(kind: StepKind): PresenceRequirement[] {
  const canonical = CANONICAL_PRESENCE[kind];
  if (canonical) return [canonical];
  return ["none", "accounted"];
}

export function defaultPresenceRequirement(kind: StepKind): PresenceRequirement {
  return CANONICAL_PRESENCE[kind] ?? "none";
}

export function isCanonicalPresence(kind: StepKind, requirement: PresenceRequirement): boolean {
  const canonical = CANONICAL_PRESENCE[kind];
  return canonical ? requirement === canonical : requirement === "none" || requirement === "accounted";
}

export function normalizePersonSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

/**
 * PRE-START BANNER (display only, V1 hotfix).
 * The live screen must never claim an operation is "not ready" when it is `ready`.
 * Returns the i18n keys for the status-aware banner, or null when no banner applies.
 */
export type LivePreStartBanner = { titleKey: string; bodyKey: string } | null;

export function livePreStartBanner(status: string | null | undefined): LivePreStartBanner {
  switch (status) {
    case "active":
      return null;
    case "ready":
      return {
        titleKey: "w04.live.preStart.ready",
        bodyKey: "w04.live.preStart.readyBody",
      };
    case "completed":
      return {
        titleKey: "w04.live.preStart.completed",
        bodyKey: "w04.live.preStart.completedBody",
      };
    case "cancelled":
      return {
        titleKey: "w04.live.preStart.cancelled",
        bodyKey: "w04.live.preStart.cancelledBody",
      };
    default:
      return { titleKey: "w04.live.notStarted", bodyKey: "w04.live.notStartedBody" };
  }
}

/* ------------------------------------------------------------------ */
/* Checklist (playbook) planning + active-operation correction helpers */
/* ------------------------------------------------------------------ */

/** Only tenant operators manage checklist definitions; operational roles grant nothing. */
export function canManageChecklist(
  role: Database["public"]["Enums"]["app_role"] | null | undefined,
): boolean {
  return role === "owner" || role === "admin" || role === "operations_agent";
}

/**
 * Checklist definitions are editable while planning, and remain correctable during
 * an active operation. `ready` keeps the frozen pre-start baseline intact; terminal
 * operations remain immutable. Runtime execution facts are stored separately and
 * are never rewritten by these definition edits.
 */
export function isChecklistEditable(
  status: string | null | undefined,
  role: Database["public"]["Enums"]["app_role"] | null | undefined,
): boolean {
  return (status === "draft" || status === "planning" || status === "active") && canManageChecklist(role);
}

/** trim + collapse inner whitespace + case/accent insensitive. */
export function normalizeChecklistTitle(value: string): string {
  return normalizePersonSearch(value).replace(/\s+/g, " ");
}

/** True when another ACTIVE item on the same step already uses this title. */
export function isDuplicateChecklistTitle(
  items: Array<Pick<PlaybookItemRow, "id" | "title" | "journey_step_id" | "is_active">>,
  args: { stepId: string | null; title: string; excludeId?: string | null },
): boolean {
  const target = normalizeChecklistTitle(args.title);
  if (!target) return false;
  return items.some(
    (item) =>
      item.is_active !== false &&
      item.journey_step_id === args.stepId &&
      item.id !== args.excludeId &&
      normalizeChecklistTitle(item.title) === target,
  );
}
