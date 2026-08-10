# W04 — JOURNEY · LIVE RUNTIME · PRESENCE · OPERATIONAL PLAYBOOKS

**W04 SECURITY GATE: PASS**
**W04 FINAL HOTFIX: PASS**
**W04 ARCHITECTURE FROZEN: YES**
**W04 CLEAN DATABASE: YES**

Frozen on 2026-08-10. W00, W01, W02 and W03 remain frozen and semantically
unchanged. No W05 surface exists.

## Frozen surface

- **Tables (5):** `journey_steps`, `journey_events`,
  `participant_presence_events`, `playbook_items`, `playbook_executions`.
- **Enums (9):** `journey_step_kind`, `step_plan_origin`,
  `step_presence_requirement`, `step_presence_population`,
  `journey_event_type`, `presence_fact`, `playbook_item_kind`,
  `playbook_requirement`, `playbook_execution_action`.
- **Commands (21):** all runtime mutation happens through approved
  `SECURITY DEFINER` commands; `authenticated` holds `SELECT` only on every
  W04 table, `anon` holds nothing.
- **Realtime publication:** `journey_steps`, `journey_events`,
  `participant_presence_events`, `playbook_executions` — and nothing else.
  `playbook_items` is deliberately not published (plan data, not runtime).
- **Derived state:** `w04_step_readiness` and `w04_operation_runtime_state`
  are read-only derivations; no readiness column is ever stored.

## Proven invariants

- **Roster != Presence.** A W03 participation says who is expected; a W04
  presence event says who is physically accounted for. Neither implies the other.
- **Planned != Expected != Actual.** Baseline plan, forecast, and recorded
  facts live in separate fields and never overwrite one another.
- **Runtime is append-only.** Journey events, presence events and playbook
  executions accept inserts through commands only; no product user can update
  or delete history.
- **Readiness is derived**, never stored, never written by a client.
- **Presence population is typed.** `participants` vs `all_confirmed` is an
  explicit property of the step.
- **Crew excluded from passenger boarding by default** under the
  `participants` population.
- **`ABSENCE_NOTED` does not satisfy readiness** and requires a reason.
- **`NO_SHOW_CONFIRMED` is privileged** — owner/admin only, reason mandatory.
- **Departure authorization requires readiness.** No override command exists
  in W04 Alpha.
- **Role assignment grants no runtime authorization.** Operational roles are
  descriptive; authorization comes from W01 membership role only.
- **Member runtime access: none.** Members read no W04 rows.
- **Cross-tenant isolation tested** at RLS and command level with real
  authenticated sessions from two tenants.
- **Realtime is operation-scoped** through RLS on the published tables.
- **Expected forecast is allowed before operation start** in `planning`,
  `ready` and `active`; blocked on terminal steps and on completed/cancelled
  operations. Planned baseline is never rewritten by a forecast change.
- **Baseline freeze from `ready` onward**; ad-hoc steps require a reason and
  are marked `ad_hoc`, preserving original plan vs reality.
- **Traveler visibility is server-controlled**; incidents are internal.

## Structural notes

- The additive FK-support index on `operation_participations(id, tenant_id)`
  is present. It is a structural index only and carries no semantic change to
  W03.
- `app_private.assert_generic_note` remains **defense-in-depth only**. It is a
  heuristic guard against obviously sensitive free text (government IDs,
  medical and financial terms); it is **not** a complete sensitive-data
  detector and must never be treated as a compliance control.

## Cleanup

All W04 verification and hotfix test data was removed in a one-shot
development maintenance transaction that temporarily paused append-only and
mutation guards and restored them before completion. No permanent cleanup RPC
exists, and no function capable of deleting history was left behind. All W01
through W04 tables and the auth user table are at zero rows.
