# W03 — PEOPLE · PARTICIPANTS · CREW · CONTEXTUAL ROLES

**Status:** FROZEN
**Security Gate:** PASS
**Date:** 2026-08-10

## Gate results

| Item | Result |
| --- | --- |
| W03 SECURITY GATE | PASS |
| W03 ARCHITECTURE FROZEN | YES |
| TENANT RLS REAL TESTED | YES |
| CROSS TENANT ATTACKS | BLOCKED |
| PERSON WITHOUT LOGIN | VERIFIED |
| ROLE ASSIGNMENT DOES NOT GRANT ACCESS | VERIFIED |
| MEMBER ROSTER ACCESS | NONE |
| PHYSICAL PRESENCE DOMAIN | NOT YET CREATED |

## Frozen conceptual separation

```text
PERSON            canonical human record, tenant-scoped, login optional
PERSON != LOGIN   a person may exist with profile_id = null forever
PERSON != ROLE    a person carries no intrinsic profession
MEMBERSHIP        the only source of authorization
PARTICIPATION     the roster truth: who should be in an operation
ROLE ASSIGNMENT   contextual responsibility inside one operation only
```

## Frozen surface

Tables: `operation_role_types`, `operation_participations`, `operation_role_assignments`.

- `participation_kind`: participant, crew, support, observer.
- `participation_status`: expected, confirmed, cancelled.
- 17 canonical system role keys, provisioned by the W03-owned
  `ensure_operation_role_types` (idempotent, self-healing, no W01 trigger).
- Tenant-safe composite foreign keys `(id, tenant_id)` throughout.
- At most one primary role per participation (partial unique index).
- Unique `(operation_id, person_id)` — one participation per person per operation.

## Security invariants (verified at runtime)

- RLS enabled on all W01–W03 tables.
- `anon`: zero table privileges, zero function execution.
- `authenticated`: SELECT only on the three W03 tables; every write goes
  through the approved SECURITY DEFINER commands.
- Roster visibility restricted to `owner`, `admin`, `operations_agent`.
  `member` has no roster access of any kind.
- `guard_w03_mutation` blocks all direct client DML on roster tables.
- `audit_events` remains append-only; every roster mutation is audited,
  including `participation.reactivated` evidence.

## Privacy note — defense in depth only

`app_private.assert_generic_note` rejects obvious carriers of identity,
financial, credential and health data in free-text notes and cancellation
reasons. **It is defense in depth, not a reliable sensitive-data classifier.**
It can produce false positives and false negatives. The binding product rule
remains: generic notes are NOT an authorized location for health, identity
document, financial or otherwise sensitive personal data. Any such data needs
a purpose-built, consent-aware domain — never a free-text field.

## Cleanup

All W03 verification data was purged through a one-off privileged development
maintenance migration (guards temporarily disabled inside the transaction and
re-enabled in the same transaction; no permanent audit-deletion RPC exists).
All business tables are at zero rows and zero auth users remain.

## Not in W03 (deliberately deferred to W04)

Physical presence, meeting point, boarding, headcount, absence, authorized
exit, arrival, disembarkation, activity, checklist, live operation.
