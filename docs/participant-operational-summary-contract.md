# Participant operational summary contract

This contract is the canonical source for participant counters in operation summary/cockpit surfaces.

## Source of truth

RPC: `public.get_operation_participant_summary(operation_id)`

The browser must not independently recalculate these counters.

## Semantics

- `planned`: non-cancelled roster memberships whose `participation_kind = participant`.
- `confirmed`: planned participants with explicit roster `status = confirmed`.
- `unconfirmed`: `planned - confirmed`.
- `present`: planned participants with at least one effective, non-retracted runtime fact among `PRESENT_AT_MEETING_POINT`, `BOARDED`, or `DISEMBARKED`.
- `boarded`: planned participants with an effective `BOARDED` fact.
- `no_show`: planned participants whose latest effective presence fact is `NO_SHOW_CONFIRMED`.

Roster membership is intention. Confirmation is readiness eligibility. Presence, boarding and no-show are runtime facts. Missing information is never converted into a fact.

## Health

Health is deterministic and must never display an elevated state without an explanation.

- `under_control`: no actionable runtime participant signal.
- `attention / NO_OPERATIONAL_PARTICIPANTS`: operation is `ready` or `active` and has no planned participants.
- `attention / UNCONFIRMED_PARTICIPANTS`: operation is `ready` or `active` and has one or more unconfirmed participants.
- `attention / CONFIRMED_NO_SHOWS`: operation is `active` and has one or more explicit no-shows.

Draft/planning gaps are planning work, not live incidents. Completed/cancelled operations do not remain in a live warning state.

## UI integration

Use `ParticipantOperationalSummary` from `src/components/operations/participant-operational-summary.tsx` or consume `fetchOperationParticipantSummary` directly.

After any mutation that can change the roster or participant facts, invalidate:

```ts
operationParticipantSummaryKey(operationId)
```

At minimum this applies after:

- add/cancel/reactivate/confirm operation participation;
- record/retract presence fact;
- record boarding/disembarkation/no-show;
- operation lifecycle changes that affect health (`ready`, `active`, `completed`, `cancelled`).

Do not change `w04_step_readiness` to count expected/unconfirmed people. Its confirmation gate is deliberate and separate from summary headcount.

## QA acceptance scenario

1. Add three participant roster memberships: expected A, B and C -> planned 3, confirmed 0.
2. Confirm A, B and C -> planned 3, confirmed 3.
3. Record presence for A and B; record explicit no-show for C -> present 2, no-show 1.
4. Record boarding for A and B -> boarded 2.
5. Complete journey and operation -> historical counters remain factual; health returns `under_control` because the operation is terminal.

No stage may infer presence or no-show merely from roster status.
