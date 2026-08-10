# COBS OS — W04 VERIFICATION & SECURITY GATE

Adversarial verification of **W04 — Journey · Live Runtime · Presence · Operational Playbooks**
executed against the real Lovable Cloud PostgreSQL backend with real authenticated sessions
(PostgREST + RPC, no mocks, no service-role shortcuts except for creating test users).

Date: 2026-08-10 · Scope: W04 only · W00/W01/W02/W03 untouched

---

## 1. Test environment (real data)

| Actor | Role | Purpose |
| --- | --- | --- |
| `w04oa_*` | Tenant A owner | privileged runtime commands |
| `w04ag_*` | Tenant A operations_agent | delegated runtime commands |
| `w04mb_*` | Tenant A member | negative authorization tests |
| `w04ob_*` | Tenant B owner | cross-tenant isolation |
| anon | — | unauthenticated surface |

Tenant A: 3 operations (planning / frozen-baseline / live-window), 8 journey steps,
6 people (5 participants + 1 crew), 6 participations, 5 checklist items.
Tenant B: 1 operation, 1 person, 1 participation.

---

## 2. Static conformance

| Check | Expected | Observed | Result |
| --- | --- | --- | --- |
| W04 tables | 5 | 5 (`journey_steps`, `journey_events`, `participant_presence_events`, `playbook_items`, `playbook_executions`) | PASS |
| W04 enums | 9 | 9 | PASS |
| Public command surface | 21 | 20 → **21 after hotfix** (`deactivate_playbook_item` was missing) | FIXED |
| Out-of-scope columns (`current_step_id`, `actual_start`, …) | none | none | PASS |
| RLS enabled on all 5 tables | yes | yes, all via `app_private.has_tenant_role` | PASS |
| Mutation guards | active | `guard_w04_mutation`, `guard_w04_append_only`, `guard_journey_step_baseline` | PASS |
| Table grants | SELECT-only for `authenticated`, none for `anon` | **full DML granted to `anon` + `authenticated`** | FIXED |
| Realtime publication | runtime fact tables only | 4 runtime tables, `playbook_items` excluded | PASS |

---

## 3. Runtime results (all proven with live sessions)

### Access control
- anon: SELECT `401`, INSERT `401`, RPC `401` on every W04 table and command. PASS
- member: sees **no** journey steps / checklists; every runtime command and both read-model
  functions rejected with *“You do not have permission for this operation runtime”*. PASS
- operations_agent: may plan, start, record presence, execute checklists — but **cannot**
  authorize departure, skip a step or confirm a no-show (owner/admin only). PASS
- Cross-tenant: tenant B owner sees `[]` for tenant A rows and is rejected by every tenant A
  command (start, readiness, runtime state, ad-hoc, presence). Tenant A cannot attach a tenant B
  participation to a tenant A step. PASS
- Direct DML by an authenticated owner on all 5 tables now returns `403` (post-hotfix). PASS
- `audit_events` UPDATE denied at grant level. PASS

### Baseline vs reality
- Planned steps can only be created while the operation is in `draft`/`planning`; after `ready`
  → *“Planned steps can only be added while the operation is still being planned.”* PASS
- Reorder after `ready` → *“The journey baseline is frozen from "ready" onward.”* PASS
- Ad-hoc step without a reason rejected; with a reason it is created as `plan_origin='ad_hoc'`,
  `planned_start/end = NULL`, with an audit event `journey.step_created_ad_hoc`. PASS
- Direct attempts to change `planned_*`, `sequence` or `plan_origin` affect 0 rows / are denied;
  byte-comparison of the baseline before and after runtime activity: **unchanged**. PASS
- Forecast (`expected_*`) changes require a reason, never touch the baseline, and emit
  `EXPECTED_TIME_CHANGED` with previous/new values. PASS

### Transition matrix
- `start_boarding`, `complete_journey_step`, milestone commands before `STEP_STARTED` → rejected.
- Boarding milestones on non-boarding steps, arrival before departure, disembarkation before
  arrival → all rejected with domain messages.
- Milestones are idempotent: repeated `start_gathering` returns the same event id, 1 row stored.
- Skipped steps cannot be started; started steps cannot be skipped; closed steps reject facts.
- Operation auto-promotes `ready → active` through the W02 command when the journey starts. PASS

### Presence & readiness
- `BOARDED` before `BOARDING_STARTED`, `DISEMBARKED` before `ARRIVED`, future timestamps and
  timestamps before the operation window → rejected.
- `NO_SHOW_CONFIRMED`: owner/admin only, reason mandatory, produces an audit event.
- Readiness is population-aware: `participants` evaluated 4 (crew and cancelled excluded),
  `all_confirmed` evaluated 5. `ABSENCE_NOTED` never satisfies readiness.
- `accounted` is satisfied by `PRESENT_AT_MEETING_POINT`, `BOARDED`, `DISEMBARKED`,
  `NO_SHOW_CONFIRMED`; `boarded` only by `BOARDED` / `NO_SHOW_CONFIRMED`.
- `authorize_departure` is a hard gate: refused with *“2 checklist item(s) and 4 person(s)
  pending”*, allowed only when readiness is fully green, and the readiness snapshot is persisted
  in the event context and the audit trail. PASS

### Playbooks
- Completion and reopening are append-only compensations (`completed` → `reopened` history kept);
  reopening requires a reason; executions cannot be deleted. PASS

### Privacy & audit
- Incident note containing a CPF rejected by the W03 privacy guard.
- Audit actions recorded for ad-hoc creation, forecast change, departure authorization, no-show,
  incident, skip and status changes; audit rows are immutable. PASS

---

## 4. Defects found and fixed this gate

| # | Severity | Defect | Fix |
| --- | --- | --- | --- |
| 1 | HIGH | `anon` **and** `authenticated` held full INSERT/UPDATE/DELETE grants on all 5 W04 tables (only RLS stood in the way) | grants revoked; `authenticated` = SELECT only, `anon` = none |
| 2 | HIGH | **Disembarkation deadlock**: `ARRIVED` required `DEPARTED` *on the same step*, while `DISEMBARKED` required `ARRIVED` and readiness required `DISEMBARKED` — a disembarkation step with `accounted` could never be completed | `record_arrival` now accepts departure recorded anywhere in the operation; chain proven end-to-end |
| 3 | HIGH | Presence facts were accepted for **cancelled** participations | rejected with *“This person is no longer part of the operation”* |
| 4 | MEDIUM | `ABSENCE_NOTED` accepted with no reason | reason now mandatory |
| 5 | MEDIUM | `deactivate_playbook_item` missing from the approved 21-command surface | command added (reason required, owner/admin/agent, tenant-scoped) |

All five fixes were re-tested with real sessions after the migration and pass.

---

## 5. Open observations (no code change made — require your decision)

1. **`READINESS_OVERRIDDEN` is unreachable.** The enum value exists but no command emits it, and
   `complete_journey_step` is *not* gated by readiness. Today the only readiness gate is
   `authorize_departure`. Either a documented override command should exist, or the enum value
   should be removed from the approved surface.
2. **Forecast changes are impossible before the operation window.** `set_step_expected_window`
   runs through the runtime timestamp guard, so a delay announced days before departure is
   rejected with *“An event cannot be backdated before the operation window.”* Planning-time
   forecasting is therefore blocked.
3. Direct-DML rejections surface the raw guard message (*“permission denied for function
   w04_control_active”*) rather than a domain message. Cosmetic only.

---

## 6. Verdict

**W04 PASSES** the verification and security gate after the five fixes above.
Tenant isolation, role separation, baseline immutability, append-only facts, idempotency,
context-aware readiness and privacy guards all behave as approved.
Verification data remains in the database and must be removed by the W04 CLEANUP & FREEZE step.
