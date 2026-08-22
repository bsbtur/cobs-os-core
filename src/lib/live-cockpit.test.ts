import { describe, expect, it } from "vitest";

import {
  computeStepDelay,
  deriveNextAction,
  deriveTone,
  summarizeStepPresence,
  type CockpitInput,
} from "@/lib/live-cockpit";
import type { JourneyStepRow, PresenceEventRow, Readiness } from "@/lib/w04";

function step(overrides: Partial<JourneyStepRow> = {}): JourneyStepRow {
  return {
    id: "step-1",
    operation_id: "op-1",
    step_kind: "meeting",
    presence_requirement: "accounted",
    presence_population: "participants",
    title: "Encontro",
    sequence: 10,
    planned_start: null,
    planned_end: null,
    expected_start: null,
    expected_end: null,
    location_label: null,
    ...overrides,
  } as unknown as JourneyStepRow;
}

function presenceEvent(overrides: Partial<PresenceEventRow>): PresenceEventRow {
  return {
    id: "pe-1",
    operation_id: "op-1",
    journey_step_id: "step-1",
    participation_id: "p-1",
    presence_fact: "PRESENT_AT_MEETING_POINT",
    occurred_at: "2026-08-22T12:00:00Z",
    retracts_presence_event_id: null,
    ...overrides,
  } as unknown as PresenceEventRow;
}

const roster = (ids: string[]) =>
  ids.map((id) => ({ id, participation_kind: "participant", status: "confirmed" }));

function readiness(overrides: Partial<Readiness> = {}): Readiness {
  return {
    step_id: "step-1",
    requirement: "accounted",
    population: "participants",
    evaluated: 2,
    satisfied: 2,
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

describe("summarizeStepPresence", () => {
  it("counts only physical positive facts as present", () => {
    const summary = summarizeStepPresence({
      step: step(),
      roster: roster(["p-1", "p-2", "p-3"]),
      presence: [
        presenceEvent({ id: "a", participation_id: "p-1", presence_fact: "PRESENT_AT_MEETING_POINT" }),
        presenceEvent({ id: "b", participation_id: "p-2", presence_fact: "BOARDED" }),
      ],
    });
    expect(summary).toEqual({ population: 3, present: 2, boarded: 1, absent: 0, pending: 1 });
  });

  it("NO_SHOW_CONFIRMED is absent, never present, and resolves readiness", () => {
    const summary = summarizeStepPresence({
      step: step(),
      roster: roster(["p-1"]),
      presence: [
        presenceEvent({ id: "a", participation_id: "p-1", presence_fact: "NO_SHOW_CONFIRMED" }),
      ],
    });
    expect(summary.absent).toBe(1);
    expect(summary.present).toBe(0);
    expect(summary.boarded).toBe(0);
    expect(summary.pending).toBe(0);
  });

  it("ABSENCE_NOTED is absent and still pending", () => {
    const summary = summarizeStepPresence({
      step: step(),
      roster: roster(["p-1"]),
      presence: [presenceEvent({ id: "a", presence_fact: "ABSENCE_NOTED" })],
    });
    expect(summary).toEqual({ population: 1, present: 0, boarded: 0, absent: 1, pending: 1 });
  });

  it("ignores retracted facts", () => {
    const summary = summarizeStepPresence({
      step: step(),
      roster: roster(["p-1"]),
      presence: [
        presenceEvent({ id: "a", presence_fact: "BOARDED" }),
        presenceEvent({
          id: "b",
          presence_fact: "PRESENCE_RETRACTED",
          retracts_presence_event_id: "a",
          occurred_at: "2026-08-22T12:05:00Z",
        }),
      ],
    });
    expect(summary).toEqual({ population: 1, present: 0, boarded: 0, absent: 0, pending: 1 });
  });

  it("unconfirmed roster people never resolve readiness", () => {
    const summary = summarizeStepPresence({
      step: step(),
      roster: [{ id: "p-1", participation_kind: "participant", status: "expected" }],
      presence: [presenceEvent({ presence_fact: "PRESENT_AT_MEETING_POINT" })],
    });
    expect(summary.present).toBe(1);
    expect(summary.pending).toBe(1);
  });

  it("restricts the population to participants when the step says so", () => {
    const summary = summarizeStepPresence({
      step: step({ presence_population: "participants" }),
      roster: [
        { id: "p-1", participation_kind: "participant", status: "confirmed" },
        { id: "c-1", participation_kind: "crew", status: "confirmed" },
      ],
      presence: [],
    });
    expect(summary.population).toBe(1);
  });
});

describe("computeStepDelay", () => {
  const now = Date.parse("2026-08-22T12:00:00Z");

  it("is unknown without a step", () => {
    expect(computeStepDelay(null, now).state).toBe("unknown");
  });

  it("is late when the expected end has passed", () => {
    const delay = computeStepDelay(step({ expected_end: "2026-08-22T11:30:00Z" }), now);
    expect(delay.state).toBe("late");
    expect(delay.lateMs).toBe(30 * 60_000);
  });

  it("is early before the expected start", () => {
    expect(computeStepDelay(step({ expected_start: "2026-08-22T13:00:00Z" }), now).state).toBe(
      "early",
    );
  });

  it("is running inside the window", () => {
    expect(
      computeStepDelay(
        step({ expected_start: "2026-08-22T11:00:00Z", expected_end: "2026-08-22T13:00:00Z" }),
        now,
      ).state,
    ).toBe("running");
  });
});

describe("deriveNextAction", () => {
  it("asks to activate the operation first", () => {
    expect(deriveNextAction(input({ operationStatus: "ready" })).key).toBe("operationNotActive");
  });

  it("starts the next step when nothing is running", () => {
    const action = deriveNextAction(input({ current: null, next: step({ id: "step-2" }) }));
    expect(action.key).toBe("startStep");
    expect(action.rpc).toBe("start_journey_step");
  });

  it("suggests completing the operation once the journey is resolved", () => {
    expect(deriveNextAction(input({ current: null, next: null, journeyResolved: true })).key).toBe(
      "completeOperation",
    );
  });

  it("opens boarding before anything else on a boarding step", () => {
    const action = deriveNextAction(
      input({
        current: step({ step_kind: "boarding", presence_requirement: "boarded" }),
        readiness: readiness({ requirement: "boarded", ready: false, satisfied: 0 }),
      }),
    );
    expect(action.rpc).toBe("start_boarding");
  });

  it("routes to people when readiness is blocked by presence", () => {
    const action = deriveNextAction(
      input({
        current: step({ step_kind: "activity" }),
        readiness: readiness({
          ready: false,
          satisfied: 1,
          missing_participations: [
            { participation_id: "p-2", full_name: "Ana", latest_fact: null },
          ],
        }),
      }),
    );
    expect(action.key).toBe("resolvePresence");
    expect(action.blocked).toBe(true);
    expect(action.anchor).toBe("cockpit-people");
  });

  it("routes to the checklist when only items are missing", () => {
    const action = deriveNextAction(
      input({
        current: step({ step_kind: "activity" }),
        readiness: readiness({
          ready: false,
          satisfied: 2,
          missing_required_items: [{ id: "i-1", title: "Kit" }],
        }),
      }),
    );
    expect(action.key).toBe("resolveChecklist");
    expect(action.anchor).toBe("cockpit-checklist");
  });

  it("requires arrival on a movement step", () => {
    const action = deriveNextAction(
      input({
        current: step({ step_kind: "movement", presence_requirement: "none" }),
        readiness: readiness({ requirement: "none", evaluated: 0, satisfied: 0 }),
      }),
    );
    expect(action.rpc).toBe("record_arrival");
  });

  it("completes disembarkation after arrival", () => {
    const action = deriveNextAction(
      input({ current: step({ step_kind: "disembarkation" }), arrived: true }),
    );
    expect(action.rpc).toBe("complete_disembarkation");
  });

  it("falls back to completing the step", () => {
    const action = deriveNextAction(
      input({ current: step({ step_kind: "activity" }), readiness: readiness({ satisfied: 2 }) }),
    );
    expect(action.rpc).toBe("complete_journey_step");
    expect(action.blocked).toBe(false);
  });
});

describe("deriveTone", () => {
  const summary = { population: 2, present: 2, boarded: 0, absent: 0, pending: 0 };

  it("is neutral when the operation is not active", () => {
    const action = deriveNextAction(input({ operationStatus: "ready" }));
    expect(
      deriveTone({
        action,
        delay: { state: "running", lateMs: 0 },
        summary,
        operationStatus: "ready",
      }),
    ).toBe("neutral");
  });

  it("is blocked when the action is blocked", () => {
    expect(
      deriveTone({
        action: { key: "resolvePresence", rpc: null, anchor: null, blocked: true },
        delay: { state: "late", lateMs: 1 },
        summary,
        operationStatus: "active",
      }),
    ).toBe("blocked");
  });

  it("is delayed when late and unblocked", () => {
    expect(
      deriveTone({
        action: { key: "completeStep", rpc: null, anchor: null, blocked: false },
        delay: { state: "late", lateMs: 1 },
        summary,
        operationStatus: "active",
      }),
    ).toBe("delayed");
  });

  it("is attention when people are still pending", () => {
    expect(
      deriveTone({
        action: { key: "completeStep", rpc: null, anchor: null, blocked: false },
        delay: { state: "running", lateMs: 0 },
        summary: { ...summary, pending: 1 },
        operationStatus: "active",
      }),
    ).toBe("attention");
  });

  it("is ready otherwise", () => {
    expect(
      deriveTone({
        action: { key: "completeStep", rpc: null, anchor: null, blocked: false },
        delay: { state: "running", lateMs: 0 },
        summary,
        operationStatus: "active",
      }),
    ).toBe("ready");
  });
});
