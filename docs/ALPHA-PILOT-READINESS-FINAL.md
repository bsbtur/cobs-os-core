# COBS OS — M6 FINAL PILOT READINESS GATE

Date: 2026-08-11 (UTC) · Scope: ALPHA CORE v0.1 (W01–W10) + M1–M5
Decision: **GO_WITH_CONTROLS**
No W11 work was started. No real pilot Operation was created. No production data was modified during this gate (read-only inspection + anonymous negative probes only).

---

## PHASE A — BASELINE INTEGRITY (live production, read-only)

| Dimension | Measured | Frozen baseline | Delta |
|---|---|---|---|
| public tables | 50 | 50 | 0 |
| tables with RLS enabled | 50 / 50 | 50 | 0 |
| public policies | 72 | 72 | 0 |
| public functions | 229 | 229 | 0 |
| SECURITY DEFINER public functions | 205 | 205 | 0 |
| SD functions **without** fixed `search_path` | **0** | 0 | 0 |
| `app_private` helpers | 98 | 98 | 0 |
| public enums | 48 | 48 | 0 |
| public triggers | 98 | 98 | 0 |
| disabled triggers | **0** | 0 | 0 |
| `anon` table grants | **0** | 0 | 0 |
| `authenticated` direct write grants | 16 privileges / 8 tables (W01–W02 legacy, RLS+role gated) | same | 0 |
| realtime publication tables | 12 (event/fact streams only) | 12 | 0 |
| W11+ objects | **none** | none | 0 |

Notes on earlier reported numbers: the M5 fidelity report counted **all schemas** (78 policies / 103 triggers incl. non-public); restricted to `public` the figures are 72 / 98 and are unchanged. This is a counting-scope difference, not a drift.

**Real foundation intact:** 1 tenant `bsbtur` (BSBTUR), 1 active `owner` membership, 1 person, 1 auth user (email-confirmed, has signed in), 2 audit events. All operational domains empty: 0 experiences, 0 operations, 0 orders, 0 messages, 0 participant access grants/invitations. No PII reproduced in this document.

**Realtime publication** exposes only append-only event/fact tables (`journey_events`, `transport_events`, `hospitality_events`, `event_runtime_events`, `communication_events`, `financial_facts`, `participant_presence_events`, `playbook_executions`, `journey_steps`, `event_sessions`, `hospitality_rooms`, `transport_legs`). Realtime still enforces RLS; no anon grant exists on any of them.

---

## PHASE B — MILESTONE EVIDENCE REVIEW

Classification is based on re-checked evidence, not on the word "PASS" in a document.

| Milestone | Classification | Strongest evidence | Remaining limitation |
|---|---|---|---|
| **M1 — cross-workflow authenticated UX/API** | VERIFIED WITH ACCEPTED LIMITATION | All 36 authenticated route modules present and reachable; 390/430/1280px layout QA passed; DEF-M1-001/002/003 fixed | OBS-M1-005 React warning (P2, cosmetic); some flows exercised via API rather than a fully injected browser session |
| **M2 — real tenant bootstrap** | VERIFIED | Live: tenant `bsbtur` + exactly 1 active owner + 1 person + confirmed auth user that has signed in; idempotent bootstrap path | Single operator identity — no second admin exists (see P2-05, bus factor) |
| **M3 — operational recovery** | VERIFIED | 229-function surface includes the M3.1 amendments `reinstate_operation` and `retract_presence_fact`; recovery runbook committed; append-only guards present on 43 tables | Recovery is command-driven and manual; no bulk correction tooling |
| **M4 — observability** | VERIFIED WITH ACCEPTED LIMITATION | `/api/public/health` returns 200 `{app, auth, data_api: up}` live; sanitized `[COBS_OBS]` envelope at QueryCache/MutationCache/root choke points; redaction drills D1–D8 | Client errors not durably persisted; no deterministic client→audit correlation_id; alerting manual/polled (OBS-M4-001..007) |
| **M5 — backup/restore** | VERIFIED WITH ACCEPTED LIMITATION | Full isolated restore drill: 11 structural dimensions SHA-256 identical, 50/50 tables content-MD5 identical, behavioural gates H1–H9 on the restored copy; tooling re-validated this gate (`gen_backup.py`, `compare.py` compile; `restore_drill.sh` syntax-clean) | Scheduled backup unproven; provider PITR unproven from this project; **`auth.*` recovery UNVERIFIED**; Storage not covered (LIM-M5-001..007) |

No milestone is REGRESSED. No milestone is INSUFFICIENT EVIDENCE.

---

## PHASE C — PILOT BLOCKER MATRIX

**P0 (absolute NO-GO): none.**
**P1 (pilot blocker): none.**

### P2 — accepted pilot limitations (each with an operating procedure)

| ID | Issue | Risk | Detection | Owner action | Recovery | Runbook |
|---|---|---|---|---|---|---|
| P2-01 | Client-side errors not durably persisted | A user-visible failure leaves no trace after the tab closes | Operator watches browser console `[COBS_OBS]` during operation; user report | Screenshot/copy the `[COBS_OBS]` line immediately; log it in the pilot incident sheet | Re-run the failed command; if state is wrong use the append-only correction command | ALPHA-OBSERVABILITY-RUNBOOK.md |
| P2-02 | No deterministic client→audit correlation_id | Slower root-cause; must correlate by actor + timestamp | Compare incident timestamp against `audit_events` | Record exact UTC time + operation id for every incident | Timestamp-window query on `audit_events` | ALPHA-OBSERVABILITY-RUNBOOK.md |
| P2-03 | Alerting is manual/polled | Failure noticed late | Scheduled human checks (Phase F) | Follow the Phase F polling cadence | Escalate per Phase F | ALPHA-OBSERVABILITY-RUNBOOK.md |
| P2-04 | Scheduled automatic backup unproven | Data loss window between manual backups | Absence of a dated backup artifact for the day | Run `scripts/backup/gen_backup.py` before + after every migration and at each pilot day close (Phase G) | Restore drill into an isolated target, never into production | ALPHA-BACKUP-RESTORE-RUNBOOK.md |
| P2-05 | Single owner identity (bus factor) | Operator unavailable → no admin action possible | Membership census: 1 active owner | Owner keeps recovery access to the owner mailbox; a second admin is invited **before** scaling beyond the pilot envelope | Invitation flow (W01) from the owner account | W01-STATUS.md |
| P2-06 | Some RLS read denials are silent (empty result, not error) | "Missing data" is ambiguous vs. permission issue | Empty list where data is expected | Verify grant/participation state via the operator surface before assuming a bug | Re-grant participant access (W10 command) | W10-STATUS.md |
| P2-07 | OBS-M1-005 React warning | Cosmetic console noise; can mask real signals | Console review | Ignore this known signature when triaging | n/a | M1-FINAL-STATUS.md |
| P2-08 | `authenticated` retains direct write grants on 8 W01/W02 tables | If a policy were weakened, direct DML would become possible | Baseline census in this document (16 privileges / 8 tables) | Re-run the Phase A census after every migration; the count must stay at 16/8 | Revoke and route through SD commands | this document |
| P2-09 | Storage recovery outside verified restore drill | Uploaded files not provably recoverable | No storage objects are used in the pilot envelope | Pilot envelope forbids storage-dependent workflows | n/a | ALPHA-BACKUP-RESTORE-RUNBOOK.md |

### P3 — deferred backlog
Automated alert delivery; durable client-error sink; correlation_id propagation; scheduled backup job + PITR proof; `auth.*` recovery verification with the provider; storage backup coverage; second-admin/role rotation UX; W11 scope.

### UNVERIFIED (explicitly not claimed as passing)
`auth.*` recovery (provider-owned), provider PITR from this project, scheduled backup execution, authenticated browser-session UX for W06/W07 surfaces (A4/A5 — preview session-injection tooling limitation).

---

## PHASE D — SECURITY FINAL GATE — **PASS**

Non-destructive verification only; no fixtures created.

| Control | Result | Evidence |
|---|---|---|
| anon cannot read production tables | PASS | 13/13 representative tables returned HTTP 401 `42501` via the public Data API (`tenants, people, memberships, profiles, operations, audit_events, participant_access_grants, participant_access_invitations, messages, orders, transport_legs, hospitality_stays, events`) |
| anon cannot invoke the command surface | PASS | `get_my_operations` → 401 permission denied; other probed RPCs not exposed to anon (404) |
| anon table grants | PASS | 0 ACL entries for `anon` on any public table |
| authenticated direct write grants | PASS (bounded) | 16 privileges on 8 legacy W01/W02 tables, every one gated by an owner/admin (or ops-agent) RLS policy using `app_private.has_tenant_role`; all 42 other tables are SELECT-only |
| RLS enabled everywhere expected | PASS | 50/50 public tables; linter reports **zero** missing-RLS/ERROR findings |
| cross-tenant isolation | PASS | Every policy predicate resolves through `app_private.is_tenant_member` / `has_tenant_role` on `tenant_id`; M5 behavioural drills H1–H4 proved anon=0 rows, no-claims=0, foreign uid=0, member=own tenant only |
| member/traveler boundary | PASS | Traveler reads only via SD projections (`get_my_*`), operation-scoped and revocable; no traveler table grant exists |
| private helpers remain private | PASS | `app_private` has no tables; only `USAGE` to `authenticated` plus EXECUTE on exactly 4 read-only predicate helpers required for RLS evaluation (`is_tenant_member`, `has_tenant_role`, `w08_current_person_id`, `w08_is_comms_operator`). No anon access |
| SD functions have fixed search_path | PASS | 205/205 SD functions carry `search_path`; 0 exceptions |
| append-only domains | PASS | 43 tables carry guard/append-only triggers; 0 disabled |
| no maintenance bypass/backdoor | PASS | No `postgres`-only escape function in `public`; no permissive "service" policy; 11 anon-EXECUTE entries are trigger functions only (not directly callable) |
| no test credential/token in production | PASS | 0 rows in `participant_access_invitations` and `participant_access_grants`; 1 auth user only |
| no disabled trigger | PASS | 0 |
| no QA tenant/user residue | PASS | 1 tenant, 1 person, 1 membership, 1 auth user, 0 operations/orders/messages |

Linter: 203 findings, all a single class — "signed-in users can execute SECURITY DEFINER function" — which is the **intended** architecture (the SD command surface is the only write path, and every function asserts caller authorization internally). Zero ERROR-level findings.

---

## PHASE H — FAILURE RESPONSE TABLETOP (non-destructive)

All twelve scenarios recover through existing approved paths. **No scenario requires undocumented direct DML.**

| # | Scenario | DETECT | CONTAIN | RECOVER | VERIFY | ESCALATE |
|---|---|---|---|---|---|---|
| 1 | Traveler cannot access portal | Traveler report; `/my` shows nothing | Confirm the person is a participation on the operation | Re-issue participant access (grant or invitation command); traveler claims token | Traveler sees the operation in `/my`; grant row is `active` | Owner if the grant exists but the portal is still empty → treat as incident, capture `[COBS_OBS]` |
| 2 | Wrong presence fact affects headcount | Headcount mismatch on the live surface | Stop further presence entry for that step | `retract_presence_fact` (M3.1), then record the correct fact | Effective headcount recomputed; both facts visible in the event log | Owner if headcount still wrong after retraction |
| 3 | Operation accidentally cancelled | Operation shows `cancelled` | Announce a hold before re-planning | `reinstate_operation` (M3.1) | Status returns to the prior lifecycle state; audit shows both transitions | Owner |
| 4 | Room assignment incorrect | Rooming list mismatch | Do not check the guest in | `change_room` / release + re-assign (W06 commands) | Assignment reflects the correct room; hospitality event log shows the change | Owner |
| 5 | Seat assignment incorrect | Manifest mismatch | If pre-departure, hold boarding | Release seat + assign seat (W05); **post-departure** requires a new ad-hoc leg (W05 lock 5) | Manifest correct; transport events show release/assign | Owner |
| 6 | Event/session cannot close | `complete_event` rejected | Leave the event open, keep guests informed | Complete **or** cancel every outstanding session (W07 reconciliation rule), then complete the event | Event terminal; no open sessions | Owner |
| 7 | Message published incorrectly | Recipient report; inbox review | Do not delete — published messages are immutable | `create_correction_message` referencing the original | Correction visible to the same audience | Owner |
| 8 | Payment recorded incorrectly | Financial state mismatch | Freeze further postings on that order | `PAYMENT_REVERSED` / `REFUND_RECORDED` append-only facts | Order financial state matches reality; both facts retained | Owner |
| 9 | Critical RPC fails during operation | Command error toast + `[COBS_OBS]` line; `/api/public/health` | Fall back to paper/verbal ops for that step; keep timestamps | Retry after health recovers; back-fill facts through the normal commands | Command succeeds; facts present with correct times | Owner; if `health` is degraded → platform escalation |
| 10 | Database data loss/corruption | Missing/incoherent rows; health checks | **Stop all writes immediately** | Restore into an **isolated** target from the newest artifact, pass structural + behavioural gates, then plan a controlled reconciliation — never restore over production | `compare.py` drift = 0 on the isolated copy | Owner + platform; `auth.*` recovery is provider-owned and UNVERIFIED |
| 11 | Frontend deployment regression | Broken UI after publish; console errors | Stop the operation's use of the affected surface | Re-publish the last known-good build (backend is unaffected — no data change) | Affected route renders and commands succeed | Owner |
| 12 | Privileged credential compromise | Unexpected sign-in / unexpected audit actor | Rotate the owner password immediately; revoke active participant access grants | Rotate API keys; review `audit_events` for the exposure window; re-grant access deliberately | Audit shows no unexplained actor; grants re-issued | Owner + platform; treat as a data-exposure event |

---

## PHASE I — FIRST PILOT SAFE ENVELOPE (definition only — nothing created)

| Constraint | Limit for the first pilot |
|---|---|
| Travelers | ≤ 15 participants |
| Operators | 1 owner + at most 1 additional operations agent |
| Transportation | ≤ 1 vehicle, ≤ 2 legs (outbound + return), no multi-leg transfers, no dispatch chaining |
| Hospitality | Optional; if used, 1 property, single-night, ≤ 8 rooms; otherwise disabled |
| Event production | Disabled, or ≤ 1 internal event with ≤ 3 sessions |
| Communication | Enabled — in-app only, operational messages; no bulk external channel |
| Commerce | Disabled by default. If used: ≤ 15 orders, manual payment recording only, no reservation-TTL-dependent flow |
| Participant portal | Enabled for read-only itinerary/messages; access granted individually by the owner |
| Duration | Single operating day (≤ 12 hours), daylight, domestic |
| External integrations | **None** |
| Data | Real customer data allowed; storage/file uploads **not** allowed (P2-09) |

Escalation beyond the envelope (more travelers, multi-day, commerce at scale, storage) requires a new readiness review.

---

## STATUS SEPARATION

**VERIFIED:** structural baseline (all 14 Phase A dimensions), RLS coverage 50/50, zero anon access, SD `search_path` 205/205, zero disabled triggers, cross-tenant isolation predicates, private-helper containment, no QA residue, real BSBTUR tenant + owner intact, health endpoint live, database restore fidelity (structure + data + behaviour), recovery tooling executable, append-only recovery paths for all 12 tabletop scenarios.

**ACCEPTED RISK (P2, with procedure):** P2-01..P2-09 above.

**UNVERIFIED (never claim as tested):** `auth.*` recovery, provider PITR, scheduled backup execution, storage recovery, authenticated-browser UX for W06/W07 A4/A5.

**DEFERRED (P3):** automated alerting, durable client-error sink, correlation_id, backup scheduling, second-admin UX, W11.

---

## GO / NO-GO

NO-GO conditions — all false: no P0, no P1, no security regression, tenant/owner consistent, no normal-recovery path requires direct DML, restore evidence sufficient, every P2 has an operating procedure.

**DECISION: GO_WITH_CONTROLS**, bound to the Phase I envelope, the Phase F monitoring control, the Phase G backup control, and `docs/ALPHA-PILOT-DAY-CHECKLIST.md`.
