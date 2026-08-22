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
