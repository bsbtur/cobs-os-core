# COBS OS — W01 Status (FROZEN)

**Workflow:** W01 — Identity · Tenant · Authorization · Security Foundation
**State:** COMPLETE / FROZEN. No W01 architecture change without a new Architecture Gate.

## Backend of record

Lovable Cloud managed backend. The external "COBS OS CLEAN BUILD" project is NOT used and must not be reintroduced.

## Security gate outcome

| Flag                            | Result                                                |
| ------------------------------- | ----------------------------------------------------- |
| W01 SECURITY GATE               | PASS                                                  |
| RLS MULTIUSER REAL TESTED       | YES                                                   |
| CROSS_TENANT LEAK FOUND         | NO                                                    |
| SIGNUP_CONFIRMATION_REAL_TESTED | NO (no mailbox access; email confirmation remains ON) |

## Frozen surface

- Tables: `tenants`, `profiles`, `people`, `memberships`, `invitations`, `audit_events`, `idempotency_keys` — RLS enabled on all 7.
- Public SECURITY DEFINER functions (5, approved): `ensure_profile`, `bootstrap_tenant`, `create_invitation`, `accept_invitation`, `link_person_to_profile`.
- `app_private` helpers: tenant membership / role predicates + audit recorder — not callable from the Data API surface.
- Triggers: `audit_events_immutable` (append-only), `memberships_guard` (last-owner + self-role protection), `set_updated_at`.
- `anon` grants on `public`: zero.
- W02+ business tables: zero.

## Development-only cleanup (2026-08-10)

The W01 Verification & Security Gate created homologation data. It was removed through a
one-shot **privileged development maintenance migration** — not through any product code path:

- 4 test tenants (`tenant-a-*`, `tenant-b-*`) and their memberships, invitations and idempotency records
- 12 test audit events
- 5 test profiles (`*@cobs.test`) and their 5 auth users (deleted via the Admin API)

The append-only trigger on `audit_events` and the membership guard were momentarily paused
**inside that single maintenance statement only** and re-enabled in the same transaction. No RPC,
policy, grant, function or trigger was added, removed or weakened, and no maintenance helper was
left behind in the schema or the application code.

Post-cleanup row counts: tenants 0, profiles 0, people 0, memberships 0, invitations 0,
audit_events 0, idempotency_keys 0, auth users 0. No real/admin account existed, so none was retained.
