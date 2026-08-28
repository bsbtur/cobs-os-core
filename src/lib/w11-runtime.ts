import type { VisitPointEventRow } from "@/lib/w11";

/**
 * The deployed W11 database uses the canonical runtime event names STARTED,
 * VISITED, IGNORED, UNAVAILABLE and RESTORED, while the original V1 client
 * derivation understands VISIT_POINT_STARTED / COMPLETED / SKIPPED.
 * Normalize only at the client boundary; persisted facts remain untouched.
 */
export function normalizeVisitPointRuntimeEventType(value: unknown): unknown {
  switch (String(value)) {
    case "STARTED":
      return "VISIT_POINT_STARTED";
    case "VISITED":
      return "VISIT_POINT_COMPLETED";
    case "IGNORED":
      return "VISIT_POINT_SKIPPED";
    default:
      return value;
  }
}

export function normalizeVisitPointRuntimeEvents(
  events: VisitPointEventRow[],
): VisitPointEventRow[] {
  return events.map((event) => ({
    ...event,
    event_type: normalizeVisitPointRuntimeEventType(event.event_type) as VisitPointEventRow["event_type"],
  }));
}
