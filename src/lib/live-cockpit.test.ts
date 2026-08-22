import { describe, expect, it } from "vitest";

import {
  EMPTY_FLAGS,
  deriveDelayMs,
  deriveNextAction,
  deriveTone,
  summarizeStepPresence,
  type CockpitFlags,
} from "./live-cockpit";
import type { JourneyStepRow, Readiness } from "./w04";

function step(overrides: Partial<JourneyStepRow> = {}): JourneyStepRow {
  return {
    id: "step-1",
    step_kind: "activity",
    presence_requirement: "none",
    presence_population: "participants",
    title: "Etapa",
    planned_start: null,
    planned_end: null,
    expected_start: null,
    expected_end: null,
    ...overrides,
  } as unknown as JourneyStepRow;
}

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
  };
}

const flags = (over: Partial<CockpitFlags> = {}): CockpitFlags => ({ ...EMPTY_FLAGS, ...over });

describe("deriveNextAction", () => {
  it("orients to starting the next step when nothing is running", () => {
    const action = deriveNextAction({
      current: null,
      next: step({ id: "step-2" }),
      readiness: null,
      flags: flags(),
      journeyResolved: false,
    });
    expect(action?.id).toBe("start_next_step");
    expect(action?.targetStepId).toBe("step-2");
  });

  it("orients to completing the operation when the journey is resolved", () => {
    const action = deriveNextAction({
      current: null,
      next: null,
      readiness: null,
      flags: flags(),
      journeyResolved: true,
    });
    expect(action?.id).toBe("complete_operation");
  });

  it("asks to open boarding before anything else on a boarding step", () => {
    const action = deriveNextAction({
      current: step({ step_kind: "boarding", presence_requirement: "boarded" }),
      next: null,
      readiness: readiness({ presence_ok: false, ready: false }),
      flags: flags(),
      journeyResolved: false,
    });
    expect(action?.id).toBe("start_boarding");
  });

  it("asks to confirm boarding once boarding is open and people are pending", () => {
    const action = deriveNextAction({
      current: step({ step_kind: "boarding", presence_requirement: "boarded" }),
      next: null,
      readiness: readiness({ presence_ok: false, ready: false }),
      flags: flags({ boardingStarted: true }),
      journeyResolved: false,
    });
    expect(action?.id).toBe("confirm_boarding");
    expect(action?.mode).toBe("focus");
  });

  it("asks to resolve people on a non-boarding step with pending presence", () => {
    const action = deriveNextAction({
      current: step({ step_kind: "meeting", presence_requirement: "accounted" }),
      next: null,
      readiness: readiness({ presence_ok: false, ready: false }),
      flags: flags(),
      journeyResolved: false,
    });
    expect(action?.id).toBe("resolve_people");
  });

  it("reports departure authorization as blocked while readiness is red", () => {
    const action = deriveNextAction({
      current: step({ step_kind: "boarding", presence_requirement: "boarded" }),
      next: null,
      readiness: readiness({ ready: false }),
      flags: flags({ boardingStarted: true, boardingCompleted: true }),
      journeyResolved: false,
    });
    expect(action?.id).toBe("authorize_departure");
    expect(action?.blocked).toBe(true);
  });

  it("asks to record departure once departure is authorized", () => {
    const action = deriveNextAction({
      current: step({ step_kind: "boarding", presence_requirement: "boarded" }),
      next: null,
      readiness: readiness(),
      flags: flags({
        boardingStarted: true,
        boardingCompleted: true,
        departureAuthorized: true,
      }),
      journeyResolved: false,
    });
    expect(action?.id).toBe("record_departed");
  });

  it("waits for ARRIVED on a movement step", () => {
    const action = deriveNextAction({
      current: step({ step_kind: "movement", presence_requirement: "none" }),
      next: null,
      readiness: readiness({ requirement: "none" }),
      flags: flags(),
      journeyResolved: false,
    });
    expect(action?.id).toBe("record_arrival");
  });

  it("blocks step completion on a movement step without ARRIVED", () => {
    const action = deriveNextAction({
      current: step({ step_kind: "return", presence_requirement: "none" }),
      next: null,
      readiness: readiness(),
      flags: flags({ arrived: false }),
      journeyResolved: false,
    });
    expect(action?.id).toBe("record_arrival");
  });

  it("asks to disembark after ARRIVED on a disembarkation step", () => {
    const action = deriveNextAction({
      current: step({ step_kind: "disembarkation", presence_requirement: "accounted" }),
      next: null,
      readiness: readiness(),
      flags: flags({ arrived: true }),
      journeyResolved: false,
    });
    expect(action?.id).toBe("complete_disembarkation");
  });

  it("offers step completion when everything is satisfied", () => {
    const action = deriveNextAction({
      current: step({ step_kind: "activity", presence_requirement: "none" }),
      next: null,
      readiness: readiness(),
      flags: flags(),
      journeyResolved: false,
    });
    expect(action?.id).toBe("complete_step");
    expect(action?.blocked).toBe(false);
  });
});

describe("deriveTone / deriveDelayMs", () => {
  const now = Date.UTC(2026, 7, 22, 18, 0, 0);

  it("is late when the step window is over", () => {
    const current = step({ expected_end: new Date(now - 600_000).toISOString() });
    expect(deriveTone({ current, readiness: readiness(), now })).toBe("late");
    expect(deriveDelayMs(current, now)).toBe(600_000);
  });

  it("is blocked when readiness is red inside the window", () => {
    const current = step({ expected_end: new Date(now + 3_600_000).toISOString() });
    expect(deriveTone({ current, readiness: readiness({ ready: false }), now })).toBe("blocked");
  });

  it("is attention close to the deadline", () => {
    const current = step({ expected_end: new Date(now + 5 * 60_000).toISOString() });
    expect(deriveTone({ current, readiness: readiness(), now })).toBe("attention");
  });

  it("is ready with a healthy window", () => {
    const current = step({ expected_end: new Date(now + 3_600_000).toISOString() });
    expect(deriveTone({ current, readiness: readiness(), now })).toBe("ready");
  });
});

describe("summarizeStepPresence", () => {
  const current = step({ presence_requirement: "boarded", presence_population: "participants" });
  const roster = [
    { id: "p1", participation_kind: "participant", status: "confirmed" },
    { id: "p2", participation_kind: "participant", status: "confirmed" },
    { id: "p3", participation_kind: "crew", status: "confirmed" },
  ];

  it("counts boarded, pending and absent for the step population", () => {
    const summary = summarizeStepPresence(current, roster, [
      {
        id: "e1",
        participation_id: "p1",
        journey_step_id: "step-1",
        presence_fact: "BOARDED",
        retracts_presence_event_id: null,
        occurred_at: "2026-08-22T17:00:00Z",
      },
    ]);
    expect(summary).toEqual({ population: 2, present: 1, boarded: 1, pending: 1, absent: 0 });
  });

  it("ignores retracted facts", () => {
    const summary = summarizeStepPresence(current, roster, [
      {
        id: "e1",
        participation_id: "p1",
        journey_step_id: "step-1",
        presence_fact: "BOARDED",
        retracts_presence_event_id: null,
        occurred_at: "2026-08-22T17:00:00Z",
      },
      {
        id: "e2",
        participation_id: "p1",
        journey_step_id: "step-1",
        presence_fact: "PRESENCE_RETRACTED",
        retracts_presence_event_id: "e1",
        occurred_at: "2026-08-22T17:05:00Z",
      },
    ]);
    expect(summary.boarded).toBe(0);
    expect(summary.pending).toBe(2);
  });
});
