# W05 — MOBILITY CORE · STATUS

**W05 ARCHITECTURE: FROZEN**
**W05 SECURITY GATE: PASS**
**W05 FOCUSED RE-VERIFICATION: PASS**
**W05 DATA STATE: CLEAN (verification residue removed 2026-08-10)**

## Scope

Vehicles, drivers, transport legs, leg stops, transport events (facts), seat
assignments, dispatch runtime, and the Mobility workspace
(`/operations/:operationId/mobility`).

## Surface (frozen)

- Tables: `vehicles`, `drivers`, `transport_legs`, `transport_leg_stops`,
  `transport_events`, `transport_seat_assignments`.
- Enums: `transport_vehicle_kind`, `transport_leg_kind`,
  `transport_event_type`, `transport_dispatch_state`.
- Public function surface: **29 mutating SECURITY DEFINER commands + 4 read
  functions = 33**.
- Realtime: **`transport_legs` and `transport_events` only**.

## Proven invariants

- **Driver → Person**: `drivers.person_id` is `NOT NULL`, tenant-composite FK.
- **Driver does not require login**: a driver needs no auth user, no
  membership, and no operation participation.
- **Driver contact single-source = Person**: no duplicate canonical name,
  phone or email on `drivers`.
- **Mobility is separate from Journey**: W05 owns vehicle dispatch,
  vehicle/driver assignment, `LEG_DEPARTED`, `STOP_REACHED`,
  `DESTINATION_ARRIVED`, `RETURN_TIME_SET`, seat assignments. W04 owns
  `BOARDED`, `DISEMBARKED`, `NO_SHOW_CONFIRMED`, `DEPARTURE_AUTHORIZED` and
  group `ARRIVED`.
- **W04 departure authorization preserved**: a leg linked to a
  departure-bearing journey step cannot record `LEG_DEPARTED` until W04 has
  emitted `DEPARTURE_AUTHORIZED` for that step.
- **W05 never auto-creates W04 facts.**
- **Transport events append-only**: no UPDATE, no DELETE, guard-enforced.
- **Typed event subjects**: `transport_events.subject_driver_id` and
  `subject_vehicle_id` with tenant-safe composite FKs — canonical subjects are
  not JSONB-only.
- **Seat history preserved**: seats belong to the transport leg (no seat field
  on `people` or `operation_participations`); release sets `released_at`
  instead of deleting; active seat uniqueness enforced case-insensitively;
  post-departure seat mutation blocked.
- **Assignment history preserved** through immutable events and audit rows;
  simple reassignment after `LEG_DEPARTED` is blocked — replacement is a new
  ad-hoc leg, never a rewrite of the original.
- **Return time**: first value may omit a reason; changing to a different value
  requires a reason; an identical value is a no-op (`unchanged = true`, no new
  `RETURN_TIME_SET`, no duplicate audit). `RETURN_TIME_SET` is a rendezvous
  agreement, distinct from planned and expected departure.
- **PLANNED ≠ EXPECTED ≠ ACTUAL**: baseline frozen, forecast mutable, actuals
  derived from immutable facts.
- **No GPS / no tracking.**
- **Member Mobility access = none.**
- **Cross-tenant isolation tested** for reads and mutations.
- **Private helpers inaccessible** to `anon` and `authenticated`.
- **Direct authenticated DML blocked** on all six W05 tables (`SELECT` only).
- **Mobile navigation verified** at 390px and 430px: 3 primary destinations +
  "Mais", 4 fixed cells, single row, no overflow.

## Accepted informational limitation

`TRANSPORT_INCIDENT_NOTED` currently derives the incident subject from the
leg's **current** driver/vehicle assignment. It is a transport annotation, not
a full Incident Core. **Do not expand it in W05.**

## Maintenance log

- 2026-08-10 — one-shot development cleanup removed all W05 implementation,
  verification, hotfix and re-verification data (test tenants, auth users and
  every dependent row). Immutable-history guards were suspended only inside
  that single transaction and restored on completion; no permanent cleanup
  function, RPC or maintenance backdoor exists. No schema, RLS, grant,
  trigger, function or realtime change was made.
