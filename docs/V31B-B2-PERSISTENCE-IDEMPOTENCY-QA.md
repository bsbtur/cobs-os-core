# V3.1-B — GATE B2 Persistence & Idempotency QA

Date: 2026-08-26
Environment: COBS OS sandbox QA (`mkjuoijrtbporbjkztla`). Production/CLEAN BUILD was not touched.

## Result

B2 is materially implemented. Persistence/idempotency invariants below passed against the QA fixture operation `V31A-QA-7cdf7990`.

| Proof | Result |
|---|---|
| Provisional persistence | PASS — first canonical evaluation persisted snapshot `4d087d08-...`, score 30 |
| Identical retry | PASS — duplicate=true and exactly one snapshot/fingerprint before fact mutation |
| Canonical fact mutation | PASS — STEP_COMPLETED + required visit-point COMPLETED changed fingerprint `36e903...` -> `66904d...` |
| New provisional after fact change | PASS — new snapshot `62cdf3ec-...`, score 100 Gold |
| Concurrency protection | PASS BY CONSTRUCTION — evaluator now takes `pg_advisory_xact_lock(hash(operation_id:model_id))` before final/duplicate decision and insert; unique indexes remain the database backstop |
| Terminal finalization | PASS — final snapshot `a3875a25-...`, score 100 Gold, finalized_at populated |
| Retry after final | PASS — returns existing final snapshot with duplicate=true, frozen=true |
| Frozen score | PASS — an additional post-final canonical journey step was inserted; evaluator still returned final 100 Gold. Test-only step was then removed. |
| Tenant isolation | PASS — non-member auth.uid received `forbidden`; member profile was allowed |
| Evidence persistence | PASS — each of the 3 snapshots has exactly 5 evidence rows / 5 dimensions |
| Score audit | PASS — dedicated `operational_score_audit` persists one SCORE_EVALUATED row per snapshot, tenant-scoped with RLS |

## Defects found and fixed during B2

1. PL/pgSQL variable `status` collided with `operations.status`, causing `column reference status is ambiguous` for real authenticated calls. Fixed by qualification + `v_eval_status`.
2. Initial audit helper invocation used the wrong legacy function signature. Fixed with a typed adapter.
3. The existing generic `app_private.record_audit_event` in this environment is currently a no-op stub. B2 therefore adds a durable, tenant-scoped `operational_score_audit` ledger while still invoking the generic hook for forward compatibility.

## Persistence contract

- Same operation + model + same canonical facts + same evaluation status => same snapshot.
- Changed canonical facts => new fingerprint and a new provisional snapshot.
- At most one final snapshot per operation/model.
- Once final exists, every evaluator call returns that snapshot before recollecting facts; later operational mutations cannot rewrite the score.
- Evaluation is serialized per operation/model with a transaction-scoped advisory lock.
- Snapshot evidence is immutable by the public evaluator path and readable only to tenant members through RLS.

## Gate decision

**GATE B2: PASS**, with one explicit testing note: the database-level concurrency invariant is implemented through advisory locking + unique constraints. A true simultaneous two-session race/load test should remain in the integration/CI suite before production release, because the current connector executes SQL serially and cannot generate two genuinely concurrent database sessions.
