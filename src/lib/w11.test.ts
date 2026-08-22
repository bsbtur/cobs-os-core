import { describe, expect, it } from "bun:test";

import {
  buildVisitPointUpdateArgs,
  canOperateVisitPoints,
  canSubmitNewVisitPoint,
  visitPointsPanelView,
  canPlanVisitPoints,
  canSkip,
  deriveStepVisitPoints,
  nextUnresolvedAfter,
  parseEstimatedMinutes,
  progressLabel,
  skipRequiresReason,
  type VisitPointEventRow,
  type VisitPointRow,
} from "./w11";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const OPERATION = "33333333-3333-3333-3333-333333333333";
const OTHER_OPERATION = "44444444-4444-4444-4444-444444444444";
const STEP = "55555555-5555-5555-5555-555555555555";

function point(
  overrides: Partial<VisitPointRow> & { id: string; sequence: number },
): VisitPointRow {
  return {
    created_at: "2026-08-22T12:00:00.000Z",
    created_by: null,
    estimated_minutes: null,
    id: overrides.id,
    interpretive_content: null,
    is_required: false,
    journey_step_id: STEP,
    metadata: {},
    operation_id: OPERATION,
    operational_note: null,
    sequence: overrides.sequence,
    tenant_id: TENANT,
    title: `Point ${overrides.sequence}`,
    updated_at: "2026-08-22T12:00:00.000Z",
    ...overrides,
  } as VisitPointRow;
}

function event(
  visitPointId: string,
  type: VisitPointEventRow["event_type"],
  overrides: Partial<VisitPointEventRow> = {},
): VisitPointEventRow {
  return {
    actor_profile_id: null,
    context: {},
    created_at: "2026-08-22T12:00:00.000Z",
    event_type: type,
    id: `${visitPointId}-${type}`,
    idempotency_key: null,
    journey_step_id: STEP,
    occurred_at: "2026-08-22T12:00:00.000Z",
    operation_id: OPERATION,
    reason: null,
    recorded_at: "2026-08-22T12:00:00.000Z",
    tenant_id: TENANT,
    visit_point_id: visitPointId,
    ...overrides,
  } as VisitPointEventRow;
}

describe("W11 — plan model", () => {
  it("lists points ordered by sequence, not insertion", () => {
    const state = deriveStepVisitPoints(
      [
        point({ id: "c", sequence: 30 }),
        point({ id: "a", sequence: 10 }),
        point({ id: "b", sequence: 20 }),
      ],
      [],
    );
    expect(state.points.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(state.total).toBe(3);
  });

  it("carries edited plan fields into the view", () => {
    const state = deriveStepVisitPoints(
      [
        point({
          id: "a",
          sequence: 10,
          title: "Vitrais de Marianne Peretti",
          interpretive_content: "Conteúdo interpretativo",
          operational_note: "Observação operacional",
          estimated_minutes: 6,
          is_required: true,
        }),
      ],
      [],
    );
    const view = state.points[0]!;
    expect(view.title).toBe("Vitrais de Marianne Peretti");
    expect(view.interpretiveContent).toBe("Conteúdo interpretativo");
    expect(view.operationalNote).toBe("Observação operacional");
    expect(view.estimatedMinutes).toBe(6);
    expect(view.isRequired).toBe(true);
  });

  it("keeps a reordered sequence authoritative", () => {
    const state = deriveStepVisitPoints(
      [point({ id: "a", sequence: 20 }), point({ id: "b", sequence: 10 })],
      [],
    );
    expect(state.points.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("W11 — derived execution state", () => {
  it("STARTED does not resolve a point", () => {
    const state = deriveStepVisitPoints(
      [point({ id: "a", sequence: 10 }), point({ id: "b", sequence: 20 })],
      [event("a", "VISIT_POINT_STARTED")],
    );
    expect(state.points[0]!.status).toBe("in_progress");
    expect(state.points[0]!.resolved).toBe(false);
    expect(state.resolved).toBe(0);
    expect(state.current?.id).toBe("a");
  });

  it("COMPLETED resolves and advances to the next point", () => {
    const state = deriveStepVisitPoints(
      [point({ id: "a", sequence: 10 }), point({ id: "b", sequence: 20 })],
      [event("a", "VISIT_POINT_STARTED"), event("a", "VISIT_POINT_COMPLETED")],
    );
    expect(state.points[0]!.status).toBe("completed");
    expect(state.resolved).toBe(1);
    expect(state.current?.id).toBe("b");
    expect(progressLabel(state)).toEqual({ position: 2, total: 2 });
  });

  it("SKIPPED resolves too", () => {
    const state = deriveStepVisitPoints(
      [point({ id: "a", sequence: 10 })],
      [event("a", "VISIT_POINT_SKIPPED", { reason: "Fechado para obras" })],
    );
    expect(state.points[0]!.status).toBe("skipped");
    expect(state.allResolved).toBe(true);
    expect(progressLabel(state)).toBeNull();
  });

  it("counts pending required points", () => {
    const state = deriveStepVisitPoints(
      [
        point({ id: "a", sequence: 10, is_required: true }),
        point({ id: "b", sequence: 20, is_required: true }),
        point({ id: "c", sequence: 30 }),
      ],
      [event("a", "VISIT_POINT_COMPLETED")],
    );
    expect(state.requiredPending).toBe(1);
    expect(state.resolved).toBe(1);
  });

  it("reports all resolved only when every point is resolved", () => {
    const points = [point({ id: "a", sequence: 10 }), point({ id: "b", sequence: 20 })];
    expect(deriveStepVisitPoints(points, [event("a", "VISIT_POINT_COMPLETED")]).allResolved).toBe(
      false,
    );
    const done = deriveStepVisitPoints(points, [
      event("a", "VISIT_POINT_COMPLETED"),
      event("b", "VISIT_POINT_SKIPPED"),
    ]);
    expect(done.allResolved).toBe(true);
    expect(done.current).toBeNull();
  });

  it("an empty step is never 'all resolved'", () => {
    const state = deriveStepVisitPoints([], []);
    expect(state.allResolved).toBe(false);
    expect(state.current).toBeNull();
    expect(state.total).toBe(0);
  });

  it("is idempotent: duplicated facts do not double-count", () => {
    const state = deriveStepVisitPoints(
      [point({ id: "a", sequence: 10 })],
      [
        event("a", "VISIT_POINT_COMPLETED", { id: "e1" }),
        event("a", "VISIT_POINT_COMPLETED", { id: "e2" }),
      ],
    );
    expect(state.resolved).toBe(1);
    expect(state.total).toBe(1);
  });

  it("never blocks W04 step completion", () => {
    const state = deriveStepVisitPoints([point({ id: "a", sequence: 10, is_required: true })], []);
    expect(state.blocksStepCompletion).toBe(false);
    expect(state.requiredPending).toBe(1);
  });
});

describe("W11 — isolation", () => {
  it("facts from another operation never resolve this step's points", () => {
    const state = deriveStepVisitPoints(
      [point({ id: "a", sequence: 10 })],
      [
        event("a", "VISIT_POINT_COMPLETED", {
          operation_id: OTHER_OPERATION,
          visit_point_id: "foreign-point",
        }),
      ],
    );
    expect(state.resolved).toBe(0);
    expect(state.current?.id).toBe("a");
  });

  it("facts from another tenant's point never resolve this point", () => {
    const state = deriveStepVisitPoints(
      [point({ id: "a", sequence: 10 })],
      [
        event("foreign", "VISIT_POINT_COMPLETED", {
          tenant_id: OTHER_TENANT,
          visit_point_id: "foreign",
        }),
      ],
    );
    expect(state.resolved).toBe(0);
  });
});

describe("W11 — next point and skip rules", () => {
  it("advances to the next unresolved point", () => {
    const state = deriveStepVisitPoints(
      [
        point({ id: "a", sequence: 10 }),
        point({ id: "b", sequence: 20 }),
        point({ id: "c", sequence: 30 }),
      ],
      [event("b", "VISIT_POINT_COMPLETED")],
    );
    expect(nextUnresolvedAfter(state, "a")?.id).toBe("c");
    expect(nextUnresolvedAfter(state, "c")).toBeNull();
  });

  it("required points demand a reason to skip", () => {
    const required = { isRequired: true };
    const optional = { isRequired: false };
    expect(skipRequiresReason(required)).toBe(true);
    expect(canSkip(required, "   ")).toBe(false);
    expect(canSkip(required, "Fechado")).toBe(true);
    expect(canSkip(optional, "")).toBe(true);
  });
});

describe("W11 — estimated minutes", () => {
  it("accepts the server range and rejects the rest", () => {
    expect(parseEstimatedMinutes("6")).toBe(6);
    expect(parseEstimatedMinutes(" 1440 ")).toBe(1440);
    expect(parseEstimatedMinutes("0")).toBeNull();
    expect(parseEstimatedMinutes("1441")).toBeNull();
    expect(parseEstimatedMinutes("abc")).toBeNull();
    expect(parseEstimatedMinutes("")).toBeNull();
  });
});

describe("W11 — operational access", () => {
  it("elevated tenant operators keep full access", () => {
    for (const role of ["owner", "admin", "operations_agent"] as const) {
      const access = { role, isOperationFieldCrew: false };
      expect(canPlanVisitPoints(access)).toBe(true);
      expect(canOperateVisitPoints(access)).toBe(true);
    }
  });

  it("field crew of this operation reads and executes but never plans", () => {
    const access = { role: "member" as const, isOperationFieldCrew: true };
    expect(canOperateVisitPoints(access)).toBe(true);
    expect(canPlanVisitPoints(access)).toBe(false);
  });

  it("a user from another operation or tenant is denied", () => {
    const otherOperation = { role: "member" as const, isOperationFieldCrew: false };
    expect(canOperateVisitPoints(otherOperation)).toBe(false);
    const otherTenant = { role: null, isOperationFieldCrew: false };
    expect(canOperateVisitPoints(otherTenant)).toBe(false);
  });

  it("anon is denied", () => {
    const anon = { role: null, isOperationFieldCrew: false };
    expect(canPlanVisitPoints(anon)).toBe(false);
    expect(canOperateVisitPoints(anon)).toBe(false);
  });
});

describe("W11 — explicit content clearing", () => {
  const base = {
    title: "Catedral",
    interpretiveContent: "Vitrais",
    operationalNote: "Entrada lateral",
    minutes: "6",
    isRequired: true,
  };

  it("clears interpretive_content when emptied", () => {
    const args = buildVisitPointUpdateArgs("vp-1", { ...base, interpretiveContent: "   " });
    expect(args["_clear_interpretive_content"]).toBe(true);
    expect(args["_interpretive_content"]).toBeUndefined();
    expect(args["_operational_note"]).toBe("Entrada lateral");
  });

  it("clears operational_note when emptied", () => {
    const args = buildVisitPointUpdateArgs("vp-1", { ...base, operationalNote: "" });
    expect(args["_clear_operational_note"]).toBe(true);
    expect(args["_operational_note"]).toBeUndefined();
    expect(args["_interpretive_content"]).toBe("Vitrais");
  });

  it("keeps values and omits clear flags when the fields are unchanged", () => {
    const args = buildVisitPointUpdateArgs("vp-1", base);
    expect(args).toEqual({
      _visit_point_id: "vp-1",
      _title: "Catedral",
      _is_required: true,
      _interpretive_content: "Vitrais",
      _operational_note: "Entrada lateral",
      _estimated_minutes: 6,
    });
  });
});

describe("W11 — panel read state (hotfix)", () => {
  it("a read failure is an error state, never an empty state", () => {
    expect(visitPointsPanelView({ isError: true, isLoading: false, total: 0 })).toBe("error");
    expect(visitPointsPanelView({ isError: true, isLoading: false, total: 3 })).toBe("error");
  });

  it("loading is distinct from empty", () => {
    expect(visitPointsPanelView({ isError: false, isLoading: true, total: 0 })).toBe("loading");
    expect(visitPointsPanelView({ isError: false, isLoading: false, total: 0 })).toBe("empty");
  });

  it("shows the list once the refreshed read arrives", () => {
    const created = deriveStepVisitPoints([point({ id: "a", sequence: 10 })], []);
    expect(visitPointsPanelView({ isError: false, isLoading: false, total: created.total })).toBe(
      "list",
    );
  });
});

describe("W11 — add button gating (hotfix)", () => {
  it("blocks a second submission while the create + refresh cycle is pending", () => {
    expect(canSubmitNewVisitPoint({ title: "QA Ponto 1", isPending: true })).toBe(false);
    expect(
      canSubmitNewVisitPoint({ title: "QA Ponto 1", isPending: false, isRefreshing: true }),
    ).toBe(false);
  });

  it("allows submission only with a title and an idle cycle", () => {
    expect(canSubmitNewVisitPoint({ title: "   ", isPending: false })).toBe(false);
    expect(canSubmitNewVisitPoint({ title: "QA Ponto 1", isPending: false })).toBe(true);
  });
});
