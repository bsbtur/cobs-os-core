# COBS V1.1 — Post-Freeze Hardening

## Frozen V1 baseline

- Commit: `175aaed9268ce158978e34931b857997c13ae1ca`
- Recovery branch: `baseline/cobs-v1-175aaed`
- The frozen baseline is immutable. Do not move or reuse that branch for development.

## V1.1 change policy

Every post-freeze change must use:

1. a new branch from the current `main`;
2. a pull request;
3. Quality Gate (build, format, typecheck, lint, tests);
4. Vercel preview validation when frontend/runtime behavior changes;
5. production validation after merge;
6. RBAC / tenant-isolation revalidation for security-sensitive changes.

No experimental feature may be introduced as a release hotfix.

## Current hardening backlog

- Make Quality Gate a required `main` ruleset check when repository permissions allow it.
- Record the final authenticated pure-traveler visual smoke for `/my/:operationId/events`.
- Add an operator-facing event schedule precision control using only the approved `set_event_schedule_precision` RPC; do not directly mutate event timestamps or lifecycle state.
- Maintain release observability and rollback evidence.
- Re-run RBAC / multi-tenant smoke after any P0/P1 hotfix.

## Payment exception

PR #67 (`CIOSP 2027 commercial RC3`) remains isolated. Do not merge it while the real Mercado Pago webhook is failing or while its own security/CI gates are incomplete.

## Rollback rule

If a post-freeze production change causes a P0/P1 regression, restore service by reverting the offending post-freeze merge. The frozen V1 baseline remains the known recovery reference and must never be rewritten to follow `main`.
