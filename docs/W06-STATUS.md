# COBS OS — W06 STATUS

**Workflow:** Hospitality · Properties · Stays · Rooms · Rooming · Check-in · Check-out
**Date frozen:** 2026-08-10

## Gate results

| Gate                                   | Result |
| -------------------------------------- | ------ |
| W06 ARCHITECTURE GATE                  | PASS   |
| W06 SECURITY GATE                      | PASS   |
| W06 FINAL HOTFIX                       | PASS   |
| W06 ACL HARDENING                      | PASS   |
| W06 BACKEND ADVERSARIAL VERIFICATION   | PASS   |
| W06 RLS/ACL GATE                       | PASS   |
| W06 DOMAIN INVARIANTS                  | PASS   |
| W06 FRONTEND STATIC VERIFICATION       | PASS   |
| **W06 ARCHITECTURE FROZEN**            | **YES** |

## W06 AUTHENTICATED BROWSER A4/A5

**UNVERIFIED — LOVABLE PREVIEW SESSION INJECTION LIMITATION**

Across repeated attempts the browser harness reported
`LOVABLE_BROWSER_AUTH_STATUS = signed_out` and injected no session, despite a
verified auth user, confirmed email, verified owner membership, a successfully
set temporary password and a successful Auth sign-in verified outside the
harness. This is a **tooling limitation**, not a product, backend, security,
RLS, domain or architecture failure. It is **not** a PASS.

### Deferred QA (UX only — must enter the future COBS authenticated E2E regression suite)

1. Completed stay in a live browser: invalid mutation controls hidden/disabled.
2. Cancelled stay in a live browser: invalid mutation controls hidden/disabled.
3. Authenticated Hospitality viewport at 390px.
4. Authenticated Hospitality viewport at 430px.
5. Live access to Hospitality through the "Mais" menu.
6. Live sheet/dialog viewport behaviour (assign room, change room, check-in,
   check-out, no-show, timeline).

All six have static implementation evidence but no authenticated browser proof.

## Frozen surface

- `W06_TABLE_COUNT` = 6
- `W06_ENUM_COUNT` = 4
- `W06_MUTATING_COMMAND_COUNT` = 26
- `W06_READ_FUNCTION_COUNT` = 4 (`w06_stay_overview`, `w06_stay_rooming`,
  `w06_stay_guests`, `w06_operation_hospitality`)
- `W06_PUBLIC_FUNCTION_COUNT` = 30 (no public function #31)
- `W06_REALTIME_TABLE_COUNT` = 2 (`hospitality_events`, `hospitality_rooms`)
- RLS enabled on all six tables; `anon` has zero privileges; `authenticated`
  has SELECT only; every mutation goes through SECURITY DEFINER commands.
- `app_private` W06 helpers are not executable by `anon` or `authenticated`.
- `member` role has zero Hospitality access.

## Frozen domain invariants

- PROPERTY != STAY · ROOM != ASSIGNMENT · ASSIGNMENT != CHECK-IN.
- Person remains the canonical identity; hospitality never copies it.
- W03 operation participation remains operation roster truth.
- Stay participation remains the hospitality manifest truth.
- Hospitality events remain runtime truth.
- PLANNED != EXPECTED != ACTUAL.
- Room move = `ROOM_RELEASED` + `ROOM_ASSIGNED` sharing a typed
  `correlation_id`. There is no `ROOM_CHANGED` event.
- Capacity enforced; overcapacity override requires owner/admin **and** a
  reason; `operations_agent` can never override capacity.
- Guest runtime state is event-derived only — never cached or stored.
- Group checkout requires every active guest resolved to `CHECKED_OUT` or
  `NO_SHOW`; `NOT_ARRIVED` and `CHECKED_IN` block checkout. No automatic
  no-show, no automatic checkout.
- Completed/cancelled stays are backend history-only.
- Hospitality no-show never mutates W03/W04/W05.
- W04 presence does not imply check-in; W05 arrival does not imply check-in.
- Room-level only — no bed/bunk/berth model anywhere in W06.

## Cleanup & freeze

All W06 verification residue was removed in a single privileged maintenance
transaction (history guards suspended per table and restored inside the same
transaction; no cleanup RPC, no maintenance endpoint, no persistent privileged
function). All verification auth users were deleted, which disposes of the
temporary owner password. Residual counts across every W01–W06 table and
`auth.users` are **0**. No schema, RLS, ACL, function, trigger or realtime
change was made during cleanup.
