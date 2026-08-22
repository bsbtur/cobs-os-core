import type { Database } from "@/integrations/supabase/types";

/**
 * COBS OS · W11 — Visit Points / Pontos da Visita (client model, pure).
 *
 * JOURNEY -> STEP -> VISIT POINT -> CHECKLIST.
 * W04 remains the sole authority over the journey step: W11 never resolves a
 * step, never touches readiness and never blocks completion. It only shows
 * progress and orientation, derived from append-only facts.
 */

export type VisitPointRow = Database["public"]["Tables"]["journey_visit_points"]["Row"];
export type VisitPointEventRow = Database["public"]["Tables"]["journey_visit_point_events"]["Row"];
export type VisitPointEventType = Database["public"]["Enums"]["visit_point_event_type"];

export const VISIT_POINT_EVENT_TYPES: VisitPointEventType[] = [
  "VISIT_POINT_STARTED",
  "VISIT_POINT_COMPLETED",
  "VISIT_POINT_SKIPPED",
];

/** STARTED never resolves; COMPLETED and SKIPPED do. */
export const RESOLVING_EVENTS: VisitPointEventType[] = [
  "VISIT_POINT_COMPLETED",
  "VISIT_POINT_SKIPPED",
];

export type VisitPointStatus = "pending" | "in_progress" | "completed" | "skipped";

export type VisitPointView = {
  id: string;
  sequence: number;
  title: string;
  interpretiveContent: string | null;
  operationalNote: string | null;
  estimatedMinutes: number | null;
  isRequired: boolean;
  status: VisitPointStatus;
  resolved: boolean;
};

export type StepVisitPointState = {
  points: VisitPointView[];
  total: number;
  resolved: number;
  requiredPending: number;
  current: VisitPointView | null;
  /** 1-based position of the current point, for "3 de 8". */
  currentPosition: number | null;
  allResolved: boolean;
  /** BINDING: W11 is advisory. It never blocks W04 step completion. */
  blocksStepCompletion: false;
};

function statusOf(pointId: string, events: VisitPointEventRow[]): VisitPointStatus {
  const own = events.filter((event) => event.visit_point_id === pointId);
  if (own.some((event) => event.event_type === "VISIT_POINT_COMPLETED")) return "completed";
  if (own.some((event) => event.event_type === "VISIT_POINT_SKIPPED")) return "skipped";
  if (own.some((event) => event.event_type === "VISIT_POINT_STARTED")) return "in_progress";
  return "pending";
}

export function isResolvedStatus(status: VisitPointStatus): boolean {
  return status === "completed" || status === "skipped";
}

/** Derived state for one step. Order is always by sequence, never by insertion. */
export function deriveStepVisitPoints(
  points: VisitPointRow[],
  events: VisitPointEventRow[],
): StepVisitPointState {
  const views: VisitPointView[] = [...points]
    .sort((a, b) => a.sequence - b.sequence)
    .map((point) => {
      const status = statusOf(point.id, events);
      return {
        id: point.id,
        sequence: point.sequence,
        title: point.title,
        interpretiveContent: point.interpretive_content,
        operationalNote: point.operational_note,
        estimatedMinutes: point.estimated_minutes,
        isRequired: point.is_required,
        status,
        resolved: isResolvedStatus(status),
      };
    });

  const resolved = views.filter((view) => view.resolved).length;
  const requiredPending = views.filter((view) => !view.resolved && view.isRequired).length;
  const currentIndex = views.findIndex((view) => !view.resolved);
  const current = currentIndex === -1 ? null : (views[currentIndex] ?? null);

  return {
    points: views,
    total: views.length,
    resolved,
    requiredPending,
    current,
    currentPosition: currentIndex === -1 ? null : currentIndex + 1,
    allResolved: views.length > 0 && resolved === views.length,
    blocksStepCompletion: false,
  };
}

/** The next unresolved point after the given one — used to advance the live card. */
export function nextUnresolvedAfter(
  state: StepVisitPointState,
  pointId: string,
): VisitPointView | null {
  const index = state.points.findIndex((point) => point.id === pointId);
  if (index === -1) return state.current;
  for (let i = index + 1; i < state.points.length; i += 1) {
    const candidate = state.points[i];
    if (candidate && !candidate.resolved) return candidate;
  }
  return null;
}

/** Mirrors the server rule: a required point can only be skipped with a reason. */
export function skipRequiresReason(point: Pick<VisitPointView, "isRequired">): boolean {
  return point.isRequired;
}

export function canSkip(point: Pick<VisitPointView, "isRequired">, reason: string): boolean {
  return skipRequiresReason(point) ? reason.trim().length > 0 : true;
}

/** Estimated minutes accepted by the server (1..1440); null clears the field. */
export function parseEstimatedMinutes(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1440) return null;
  return parsed;
}

/** "3 de 8" — position label. Null when nothing is pending. */
export function progressLabel(
  state: StepVisitPointState,
): { position: number; total: number } | null {
  if (state.currentPosition === null) return null;
  return { position: state.currentPosition, total: state.total };
}

/* ------------------------------------------------------------------------ *
 * W11 HOTFIX — operational access + explicit content clearing.
 * Mirrors the server rules; the server remains the sole authority.
 * ------------------------------------------------------------------------ */

/** Tenant roles that may plan (create / edit / reorder) visit points. */
export const W11_PLANNING_ROLES = ["owner", "admin", "operations_agent"] as const;

/** Canonical operation role keys with field-execution responsibility. */
export const W11_FIELD_ROLE_KEYS = [
  "guide",
  "coordinator",
  "academic_coordinator",
  "monitor",
] as const;

export type VisitPointAccess = {
  /** Tenant membership role for the ACTIVE tenant, null when signed out. */
  role: (typeof W11_PLANNING_ROLES)[number] | "member" | null;
  /** True only when the user is crew of THIS operation with a field role. */
  isOperationFieldCrew: boolean;
};

/** Planning stays elevated-only. Field crew never plans. */
export function canPlanVisitPoints(access: VisitPointAccess): boolean {
  return access.role !== null && (W11_PLANNING_ROLES as readonly string[]).includes(access.role);
}

/** Reading and recording runtime facts: elevated roles OR this operation's field crew. */
export function canOperateVisitPoints(access: VisitPointAccess): boolean {
  return canPlanVisitPoints(access) || access.isOperationFieldCrew;
}

export type VisitPointUpdateInput = {
  title: string;
  interpretiveContent: string;
  operationalNote: string;
  minutes: string;
  isRequired: boolean;
};

/**
 * Builds the RPC arguments for update_visit_point.
 * An emptied text field is an EXPLICIT clear, never a silent no-op.
 */
export function buildVisitPointUpdateArgs(
  visitPointId: string,
  input: VisitPointUpdateInput,
): { _visit_point_id: string } & Record<string, unknown> {
  const interpretive = input.interpretiveContent.trim();
  const operational = input.operationalNote.trim();
  const parsed = parseEstimatedMinutes(input.minutes);
  return {
    _visit_point_id: visitPointId,
    _title: input.title.trim(),
    _is_required: input.isRequired,
    ...(interpretive
      ? { _interpretive_content: interpretive }
      : { _clear_interpretive_content: true }),
    ...(operational ? { _operational_note: operational } : { _clear_operational_note: true }),
    ...(parsed === null ? { _clear_estimated_minutes: true } : { _estimated_minutes: parsed }),
  };
}

/* ------------------------------------------------------------------------ *
 * W11 HOTFIX — read failures must never look like "no visit points".
 * ------------------------------------------------------------------------ */

/** What the visit-points panel must render for a given query state. */
export type VisitPointsPanelView = "loading" | "error" | "empty" | "list";

export function visitPointsPanelView(query: {
  isError: boolean;
  isLoading: boolean;
  total: number;
}): VisitPointsPanelView {
  if (query.isError) return "error";
  if (query.isLoading) return "loading";
  return query.total === 0 ? "empty" : "list";
}

/**
 * The add button stays disabled for the WHOLE create + refresh cycle, so a
 * second click can never silently create a duplicate point.
 */
export function canSubmitNewVisitPoint(input: {
  title: string;
  isPending: boolean;
  isRefreshing?: boolean;
}): boolean {
  return input.title.trim().length > 0 && !input.isPending && !input.isRefreshing;
}
