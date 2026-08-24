import { describe, expect, it } from "bun:test";

import { deriveNextAction, type CockpitInput } from "@/lib/live-cockpit";
import type { JourneyStepRow, Readiness } from "@/lib/w04";

function step(overrides: Partial<JourneyStepRow> = {}): JourneyStepRow {
  return {
    id: "step-1",
    operation_id: "op-1",
    step_kind: "activity",
    presence_requirement: "none",
    presence_population: "participants",
    title: "Etapa",
    sequence: 10,
    planned_start: null,
    planned_end: null,
    expected_start: null,
    expected_end: null,
    location_label: null,
    ...overrides,
  } as unknown as JourneyStepRow;
}

function readiness(overrides: Partial<Readiness> = {}): Readiness {
  return {
    step_id: "step-1",
    requirement: "none",
    population: "participants",
    evaluated: 0,
    satisfied: 0,
    missing_participations: [],
    missing_required_items: [],
    presence_ok: true,
    checklist_ok: true,
    ready: true,
    ...overrides,
  } as Readiness;
}

function input(overrides: Partial<CockpitInput> = {}): CockpitInput {
  return {
    operationStatus: "active",
    current: step(),
    next: null,
    readiness: readiness(),
    arrived: false,
    boardingStarted: false,
    journeyResolved: false,
    ...overrides,
  };
}

describe("live sequential action machine", () => {
  it("puts required checklist before presence once an opening command exists", () => {
    const action = deriveNextAction(
      input({
        current: step({ step_kind: "meeting", presence_requirement: "accounted" }),
        gatheringStarted: true,
        readiness: readiness({
          requirement: "accounted",
          ready: false,
          checklist_ok: false,
          presence_ok: false,
          missing_required_items: [{ id: "item-1", title: "Orientações" }],
          missing_participations: [
            { participation_id: "p-1", full_name: "Viajante", latest_fact: null },
          ],
        }),
      }),
    );

    expect(action.key).toBe("resolveChecklist");
    expect(action.anchor).toBe("cockpit-checklist");
  });

  it("enforces boarding open → checklist/presence → close → authorize → depart → finish", () => {
    const boarding = step({ step_kind: "boarding", presence_requirement: "boarded" });
    const ready = readiness({ requirement: "boarded", ready: true, evaluated: 1, satisfied: 1 });

    expect(
      deriveNextAction(input({ current: boarding, readiness: ready, boardingStarted: false })).rpc,
    ).toBe("start_boarding");

    expect(
      deriveNextAction(
        input({
          current: boarding,
          readiness: ready,
          boardingStarted: true,
          boardingCompleted: false,
        }),
      ).rpc,
    ).toBe("complete_boarding");

    expect(
      deriveNextAction(
        input({
          current: boarding,
          readiness: ready,
          boardingStarted: true,
          boardingCompleted: true,
          departureAuthorized: false,
        }),
      ).rpc,
    ).toBe("authorize_departure");

    expect(
      deriveNextAction(
        input({
          current: boarding,
          readiness: ready,
          boardingStarted: true,
          boardingCompleted: true,
          departureAuthorized: true,
          departed: false,
        }),
      ).rpc,
    ).toBe("record_departed");

    expect(
      deriveNextAction(
        input({
          current: boarding,
          readiness: ready,
          boardingStarted: true,
          boardingCompleted: true,
          departureAuthorized: true,
          departed: true,
        }),
      ).rpc,
    ).toBe("complete_journey_step");
  });

  it("does not expose arrival completion before ARRIVED on movement", () => {
    const movement = step({ step_kind: "movement", presence_requirement: "none" });
    expect(deriveNextAction(input({ current: movement, arrived: false })).rpc).toBe("record_arrival");
    expect(deriveNextAction(input({ current: movement, arrived: true })).rpc).toBe(
      "complete_journey_step",
    );
  });

  it("locks terminal operations out of runtime commands", () => {
    const action = deriveNextAction(input({ operationStatus: "completed" }));
    expect(action.key).toBe("operationNotActive");
    expect(action.rpc).toBeNull();
    expect(action.blocked).toBe(true);
  });
});
