import { describe, expect, it } from "bun:test";

import { deriveNextAction, type CockpitInput } from "@/lib/live-cockpit";
import type { JourneyStepRow, Readiness } from "@/lib/w04";

function disembarkationStep(): JourneyStepRow {
  return {
    id: "step-disembarkation",
    operation_id: "op-1",
    step_kind: "disembarkation",
    presence_requirement: "accounted",
    presence_population: "participants",
    title: "Desembarque",
    sequence: 50,
    planned_start: null,
    planned_end: null,
    expected_start: null,
    expected_end: null,
    location_label: null,
  } as unknown as JourneyStepRow;
}

function readiness(overrides: Partial<Readiness> = {}): Readiness {
  return {
    step_id: "step-disembarkation",
    requirement: "accounted",
    population: "participants",
    evaluated: 1,
    satisfied: 0,
    missing_participations: [
      { participation_id: "p-1", full_name: "Mariana Alves QA", latest_fact: null },
    ],
    missing_required_items: [],
    presence_ok: false,
    checklist_ok: true,
    ready: false,
    ...overrides,
  } as Readiness;
}

function input(overrides: Partial<CockpitInput> = {}): CockpitInput {
  return {
    operationStatus: "active",
    current: disembarkationStep(),
    next: null,
    readiness: readiness(),
    arrived: false,
    boardingStarted: false,
    disembarkationCompleted: false,
    journeyResolved: false,
    ...overrides,
  };
}

describe("disembarkation live sequence", () => {
  it("records arrival before asking for DISEMBARKED presence facts", () => {
    const action = deriveNextAction(input());

    expect(action.key).toBe("recordArrival");
    expect(action.rpc).toBe("record_arrival");
    expect(action.blocked).toBe(false);
  });

  it("asks to resolve passenger presence after arrival is recorded", () => {
    const action = deriveNextAction(input({ arrived: true }));

    expect(action.key).toBe("resolvePresence");
    expect(action.anchor).toBe("cockpit-people");
    expect(action.blocked).toBe(true);
  });

  it("allows completing disembarkation after arrival and readiness are satisfied", () => {
    const action = deriveNextAction(
      input({
        arrived: true,
        readiness: readiness({
          satisfied: 1,
          missing_participations: [],
          presence_ok: true,
          ready: true,
        }),
      }),
    );

    expect(action.key).toBe("completeDisembarkation");
    expect(action.rpc).toBe("complete_disembarkation");
    expect(action.blocked).toBe(false);
  });
});
