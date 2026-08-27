# V3.1-B — B5.3 Adversarial / Idempotency Gate

Date: 2026-08-26
Branch: `feat/v3.1-b5-runtime-integration`
Sandbox QA: `mkjuoijrtbporbjkztla` (COBS OS)
CLEAN BUILD/main: not touched

## Objective

Attack the runtime-finalization boundary after B5.2 with retries, duplicate completion attempts, post-completion calls, tenant abuse and score/evidence duplication checks.

Target invariant:

`one operation completion => one stable final snapshot => one evidence set => immutable read-only reuse`

## Fixture

Operation: `7debadf3-defe-4645-a81c-6fbc5be17905` (`V31B-B4-QA-94`).

Before the clean retry test the QA score artifacts were cleared and the operation was returned to `active / completed_at NULL`.

## Results

| Attack / proof | Result |
|---|---|
| First completion | PASS — `completed`, final Gold 94.44 snapshot created |
| Immediate second completion | PASS — no new snapshot; lifecycle returns `unchanged=true` and the same frozen summary |
| Repeated completion RPC | PASS — stable snapshot id `a3c50203-f7b9-4aea-9311-3206bafbfecf` |
| Direct evaluator retries after completion | PASS — still exactly one final snapshot |
| Evidence duplication | PASS — exactly 5 evidence rows after all retries |
| Score audit duplication | PASS — exactly 1 score-audit row for the final snapshot |
| Attempt to move terminal operation back to active | PASS — rejected; terminal snapshot remained unique |
| Non-member completion attempt | PASS — rejected by tenant membership guard; state/snapshot unchanged |
| Final snapshot uniqueness backstop | PASS — partial unique final index remains present |
| Same-facts uniqueness backstop | PASS — same-facts/evaluation unique index remains present |
| Evaluator serialization | PASS BY CONSTRUCTION — `pg_advisory_xact_lock` is present in `evaluate_operational_excellence` |
| Lifecycle serialization | PASS BY CONSTRUCTION — `set_operation_status` locks the operation row `FOR UPDATE` before deciding unchanged/transition |

## Stable final state

After repeated lifecycle and evaluator calls:

- operation status: `completed`
- final snapshot count: `1`
- final snapshot id: `a3c50203-f7b9-4aea-9311-3206bafbfecf`
- score: `94.44`
- classification: `gold`
- evidence rows: `5`
- score audit rows: `1`

The retry payload returned the same canonical snapshot with:

- `unchanged=true`
- `frozen=true`
- `rounded_score=94`
- `classification=gold`

## Concurrency / two-admin race note

The available Supabase connector executes SQL requests serially and does not expose two simultaneously controlled database sessions. Therefore a genuine two-session race between two administrator identities was **not fabricated or claimed as executed**.

The concurrency invariant is nevertheless protected by two independent database mechanisms:

1. lifecycle `SELECT ... FOR UPDATE` serializes simultaneous status transitions on the same operation row;
2. evaluator `pg_advisory_xact_lock(operation:model)` plus unique final/same-facts indexes serializes score persistence and provides a uniqueness backstop.

A real two-session race remains a required automated integration/CI test before production rollout. It should assert that two authorized admins issuing completion concurrently receive one logical completion, one stable final `snapshot_id`, five evidence rows total and no unique-constraint leak to the client.

## Decision

**B5.3 — PASS WITH CONCURRENCY-INTEGRATION FOLLOW-UP.**

All adversarial/idempotency properties executable in the sandbox are green. No defect requiring a runtime patch was found. The only remaining item is a true parallel-session race test in CI/integration infrastructure.

Next gate: **B5.4 — End-to-End Runtime → Operational Excellence Mobile**, using a sandbox operation from real lifecycle completion through retrieval/rendering of the frozen B4 experience.
