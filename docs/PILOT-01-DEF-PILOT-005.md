# DEF-PILOT-005 — R1 + R2 Controlled Amendment

Status: IMPLEMENTED · QA PASS (26/26) · NOT YET EXECUTED AGAINST REAL PILOT-01

## R1 — `public.revoke_operation_completion(_operation_id uuid, _reason text, _idempotency_key uuid)`

- Owner-only; identity exclusively from `auth.uid()`; `SECURITY DEFINER`, `search_path = pg_catalog, public`.
- Mandatory validated reason (`app_private.assert_generic_note`).
- Action-scoped idempotency: `idempotency_keys.action = 'operation.completion_revoke'`.
- Accepts only `status = 'completed'`; correction target = `ready`.
- Clears `completed_at` only because `operations_completed_consistency` requires the stamp
  to exist exclusively while status = `completed`. Original value preserved in audit metadata.
- Appends `operation.completion_revoked`; never deletes/rewrites `operation.completed` or any fact.
- Narrow scope: recoverable only when runtime evidence **as of `completed_at`** is zero.

## R2 — Terminal completion guard

`set_operation_status(..., 'completed')` now requires at least one legitimate runtime fact
recorded before the transition:

- W04 journey: STEP_STARTED / STEP_COMPLETED / GATHERING_STARTED / BOARDING_STARTED /
  BOARDING_COMPLETED / DEPARTURE_AUTHORIZED / DEPARTED / ARRIVED / DISEMBARKATION_COMPLETED
- W04 presence: PRESENT_AT_MEETING_POINT / BOARDED / DISEMBARKED
- W05 transport: VEHICLE_EN_ROUTE_TO_PICKUP / VEHICLE_AT_PICKUP / LEG_DEPARTED / STOP_REACHED / DESTINATION_ARRIVED
- W07 event production: EVENT_STARTED / EVENT_COMPLETED / SESSION_STARTED / SESSION_COMPLETED

Shared helper: `app_private.w02_runtime_evidence(_operation_id, _as_of)` (EXECUTE revoked from public).
The evidence census is recorded in the `operation.completed` audit metadata.

## Terminal-state runtime finding (reported, NOT fixed here)

`record_vehicle_at_pickup` → `app_private.w05_assert_open(leg)` only checks LEG_CANCELLED and
LEG_DEPARTED. No W05 command consults the parent Operation status. Therefore W05 facts are
accepted after an Operation reaches `completed`/`cancelled`. This is an **unintended
terminal-state gap (LIM-DEF005-001)**, not an intentional contract. R2 was NOT broadened to
close it; it requires its own W05 amendment authorization.

The accidental Pilot-01 `VEHICLE_AT_PICKUP` (05:54:15Z, after completion at 05:52:22Z) is
preserved untouched as incident evidence and is intentionally NOT counted by R1, because R1
judges legitimacy by evidence existing at the completion instant.

## Frontend safety

`operations/$operationId` lifecycle panel: completion is no longer an ordinary "advance"
button. It is isolated in a destructive-framed block labelled "Ação final" with an
AlertDialog: "Encerrar esta operação?" explaining that it ends the whole trip in COBS and is
not the same as completing an individual check-in/boarding/step. pt-BR/en-US strings added.

## QA (isolated tenants `qad5*`, destroyed after the run)

26/26 PASS — anon, traveler, agent, admin, cross-tenant, unknown op, wrong-tenant op, blank
reason, null key, sensitive reason, non-completed op, genuine completion protected,
accidental recovery to ready, evidence census, replay idempotency, cross-command key reuse,
no duplicate recovery, audit preservation + append, direct DML denied, anon-key RPC denied,
R2 block + R2 allow. QA residue = 0 (tenants, ops, profiles, auth users all removed).
