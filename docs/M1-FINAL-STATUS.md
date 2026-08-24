# COBS OS — M1 FINAL STATUS (Cross-Workflow Authenticated UX QA)

Date: 2026-08-10 (UTC)
Scope: W01–W10 authenticated Golden Path QA + mobile viewport hotfixes + QA data cleanup.

## Verdict

| Item                               | Result             |
| ---------------------------------- | ------------------ |
| M1_CROSS_WORKFLOW_AUTHENTICATED_QA | PASS               |
| M1_CLEAN_DATABASE                  | YES                |
| P0_OPEN                            | 0                  |
| P1_OPEN                            | 0                  |
| P2_OPEN                            | OBS-M1-005 only    |
| W01–W10                            | FROZEN (unchanged) |
| W11                                | BLOCKED            |

## Defects

- DEF-M1-001 (`/operations`, 390px horizontal overflow) — CLOSED
- DEF-M1-002 (`/operations/:operationId/live`, 390px overflow) — CLOSED
- DEF-M1-003 (`/commerce`, 390px overflow) — CLOSED
- OBS-M1-005 — P2, non-blocking: pre-existing React warning on `/commerce/:orderId`. Documented, deliberately not addressed; no Commerce redesign performed.

Viewports: 390px PASS · 430px PASS · 1280px PASS.

## Phase A — M1 QA Cleanup

Pre-cleanup inspection (live backend, not reported counts):

- Tenants: exactly 1 — `ALPHAQA BSBTUR` (`alphaqa-bsbtur`), created 2026-08-10 22:49 UTC.
- People: 7, all under the QA tenant, all QA-labelled, emails on `alphaqa.*@example.com`.
- Auth users: 5, all `alphaqa.*@example.com`.
- Every application row traced by tenant/operation ancestry to the single QA tenant.
- Non-QA / real data found: NONE. Cleanup therefore proceeded.

Cleanup executed as one privileged one-shot maintenance operation:

- `TRUNCATE` of all 50 public application tables (`RESTART IDENTITY CASCADE`).
- Deletion of the 5 QA auth users.
- No `session_replication_role` change was needed or possible; no triggers were disabled at any point.

Left behind: nothing. No cleanup RPC, no maintenance endpoint, no history-delete RPC, no temporary `SECURITY DEFINER` helper, no admin bypass, no password bypass, no token inspection route.

## Post-cleanup baseline

- Total application rows across all 50 public tables: **0**
- Tenants: 0 · Auth users: 0
- Disabled triggers: **0**

Structural baseline (unchanged vs. W10 freeze):

| Metric                      | Value |
| --------------------------- | ----- |
| Public tables               | 50    |
| Public functions            | 226   |
| `app_private` helpers       | 98    |
| RLS policies                | 72    |
| Public enums                | 48    |
| Non-internal triggers       | 103   |
| Realtime publication tables | 12    |

Schema, RLS, ACL, functions, helpers, triggers, Realtime and W01–W10 semantics: UNCHANGED. W11+ schema: ABSENT.

## Next

Database is clean and structurally frozen — ready for M2 Real Tenant Bootstrap.
Pilot operation setup (M3) not started. W11 not opened.
