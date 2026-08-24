import { describe, expect, it } from "vitest";

import {
  normalizeVisitPointRuntimeEventType,
  normalizeVisitPointRuntimeEvents,
} from "@/lib/w11-runtime";
import { deriveStepVisitPoints, type VisitPointEventRow, type VisitPointRow } from "@/lib/w11";

describe("W11 deployed runtime compatibility", () => {
  it("maps deployed VISITED and IGNORED events to the V1 client model", () => {
    expect(normalizeVisitPointRuntimeEventType("VISITED")).toBe("VISIT_POINT_COMPLETED");
    expect(normalizeVisitPointRuntimeEventType("IGNORED")).toBe("VISIT_POINT_SKIPPED");
    expect(normalizeVisitPointRuntimeEventType("VISIT_POINT_STARTED")).toBe(
      "VISIT_POINT_STARTED",
    );
  });

  it("advances from point 1 to point 2 after a deployed VISITED fact", () => {
    const points = [
      { id: "point-1", sequence: 10, title: "Primeiro ponto" },
      { id: "point-2", sequence: 20, title: "Segundo ponto" },
    ] as unknown as VisitPointRow[];

    const events = [
      { visit_point_id: "point-1", event_type: "VISITED" },
    ] as unknown as VisitPointEventRow[];

    const state = deriveStepVisitPoints(points, normalizeVisitPointRuntimeEvents(events));

    expect(state.points[0]?.status).toBe("completed");
    expect(state.current?.id).toBe("point-2");
    expect(state.currentPosition).toBe(2);
    expect(state.resolved).toBe(1);
  });

  it("treats deployed IGNORED as skipped and advances", () => {
    const points = [
      { id: "point-1", sequence: 10, title: "Primeiro ponto" },
      { id: "point-2", sequence: 20, title: "Segundo ponto" },
    ] as unknown as VisitPointRow[];

    const events = [
      { visit_point_id: "point-1", event_type: "IGNORED" },
    ] as unknown as VisitPointEventRow[];

    const state = deriveStepVisitPoints(points, normalizeVisitPointRuntimeEvents(events));

    expect(state.points[0]?.status).toBe("skipped");
    expect(state.current?.id).toBe("point-2");
  });
});
