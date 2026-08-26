# COBS V3.1-B5 — Operational Excellence Runtime Contract

Date: 2026-08-26
Status: B5.1 inventory / no runtime logic changed
Base: frozen B4 commit `261088392feefb6f6ee2eacb3416d855f80c71db`
Branch: `feat/v3.1-b5-runtime-integration`

## 1. Authoritative operation completion path

The authenticated Operation Overview invokes:

`public.set_operation_status(_operation_id, 'completed', _reason?)`

The lifecycle UI does not write `operations` directly. On success it currently only shows feedback and invalidates operation queries.

### Completion guards inside `set_operation_status`

Before an active operation may become completed, the RPC:

1. requires an authenticated actor;
2. requires tenant membership in owner/admin/operations_agent for lifecycle changes;
3. requires owner/admin specifically for `completed`;
4. locks the operation row `FOR UPDATE`;
5. rejects a terminal operation changing state again;
6. validates the lifecycle transition `active -> completed`;
7. requires actual runtime evidence from `app_private.w02_runtime_evidence` (`total > 0`);
8. requires every non-archived journey step to be terminal by evidence of `STEP_COMPLETED` or `STEP_SKIPPED`;
9. requires no operation staff assignment to remain `assigned` or `confirmed`.

Only after those guards pass does the RPC set `app.op_control=on` and update:

- `operations.status = 'completed'`
- `operations.completed_at = now()`

It then records the `operation.completed` audit event.

## 2. Canonical score facts available at completion

`app_private.collect_operational_excellence_facts(operation_id)` currently reads only persisted canonical facts:

- operation tenant/status/completed_at;
- Journey: `journey_steps` + `journey_events.STEP_COMPLETED`;
- Temporal: planned starts + actual `STEP_STARTED` timestamps;
- Compliance: required visit-point metadata + visit-point events (`VISITED`, `PRESENTED`, `COMPLETED`);
- Flow traceability: flow-kind journey steps + `STEP_COMPLETED`;
- Communication: explicitly N/A until an operation-scoped canonical communication projection exists.

The collector does not trust a score, classification, or dimension ratio supplied by the browser.

## 3. Atomic integration point

### Chosen B5 contract

For QA/runtime integration the correct boundary is the existing `set_operation_status` database transaction.

For `active -> completed`:

1. acquire/retain operation row lock;
2. run all existing completion guards;
3. persist `operations.status='completed'` and `completed_at=now()`;
4. while still in the same transaction, finalize Operational Excellence from canonical facts;
5. persist snapshot + evidence + fingerprint/audit;
6. record lifecycle audit;
7. return lifecycle result plus a read-only excellence summary.

This ordering is deliberate: the collector should observe the operation as completed with its final `completed_at`, while any unexpected failure still rolls back the whole transaction during B5 QA.

The frontend must never call `evaluate_operational_excellence(..., true)` as a second independent request after completion. That would create a non-atomic gap.

## 4. Snapshot behavior

- A valid scored result persists `evaluation_status='final'` and is immutable/frozen.
- `insufficient_evidence` is a valid deterministic result with no invented score/classification. Operation completion must not turn missing evidence into zero or a guessed class.
- Retry must return the existing frozen final evaluation where one exists.
- UI remains read-only and consumes the persisted snapshot/evidence.

## 5. Contract decision required: STEP_SKIPPED

There is a semantic mismatch that must be resolved before B5.2 coding:

- lifecycle completion considers `STEP_SKIPPED` terminal;
- the current excellence collector counts only `STEP_COMPLETED` for Journey Execution and Flow Traceability.

Recommended policy:

**A skipped step remains terminal for lifecycle safety but does not automatically earn full excellence credit.**

For V3.1-B5, keep this distinction explicit. A skip should either reduce the relevant ratio or, in a future model revision, be scored through a reason-aware rule. Do not silently reinterpret `STEP_SKIPPED` as completed in model v1 without versioning the score model.

## 6. Failure semantics

During B5 QA, score finalization is treated as part of the completion invariant and runs transactionally. Unexpected score-engine errors therefore roll back completion. This gives the strongest consistency signal while hardening the integration.

Before production rollout, explicitly review availability trade-off. If operational continuity must dominate analytics availability, move unexpected score failures to a durable post-commit/outbox retry model while preserving the exact completion facts/fingerprint. Do not silently use a best-effort frontend retry.

## 7. Existing freeze guarantees

The system already has terminal-operation write guards across Journey/transport/hospitality/access/runtime paths. This is important because once the final score is created, the underlying operation facts are expected to become historical/read-only.

B5.3 must re-prove those mutation blocks around a scored completed operation.

## 8. Sandbox limitation

The secondary `COBS OS` sandbox contains the V3.1 score engine compatibility layer, but it does not currently contain the full V1 `set_operation_status` lifecycle RPC. B5.2 E2E testing therefore requires a sandbox-compatible lifecycle fixture/adapter mirroring the authoritative guards. Production/CLEAN BUILD must remain untouched.

## 9. B5 gates

- **B5.1 Runtime Contract:** this document + inventory.
- **B5.2 Finalization Integration:** implement transaction-bound score finalization on isolated branch/sandbox fixture.
- **B5.3 Adversarial & Idempotency:** incomplete op, retry, cross-tenant, post-final mutation, insufficient evidence, unexpected failure, concurrency invariant.
- **B5.4 End-to-End Mobile:** execute a real sandbox lifecycle and consume the exact persisted result in the frozen B4 experience.

## B5.1 decision

**Runtime integration target is the database lifecycle boundary, not the frontend. No production runtime code has been changed in B5.1.**
