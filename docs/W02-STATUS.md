# W02 — EXPERIENCE · OFFERING · OPERATION CORE — STATUS

**State:** FROZEN
**Security gate:** PASS
**Date of freeze:** 2026-08-10

## Canonical surface (frozen)

### Tables (3, no others were created)

| Table         | Meaning                                                 |
| ------------- | ------------------------------------------------------- |
| `experiences` | Catalog. What the organization is able to deliver.      |
| `offerings`   | Commercial format of an experience. Never stands alone. |
| `operations`  | A real execution with its own historical identity.      |

`EXPERIENCE != OFFERING != OPERATION` is structural, not conventional.

### Commands (7 public SECURITY DEFINER, `search_path` pinned)

`create_experience`, `create_offering`, `create_operation`,
`set_operation_status`, `set_operation_planned_window`,
`set_operation_expected_window`, `set_operation_archived`.

All are idempotent through `idempotency_keys` (W01) where they create entities,
and all write audit through the W01 `audit_events` foundation. W02 created no
audit table of its own.

### Mutation boundary (database-enforced)

- `guard_operation_insert` — a new operation always starts as an un-executed
  `draft` with no lifecycle or temporal facts.
- `guard_operation_mutation` — direct client `UPDATE` of `status`,
  `planned_start/end`, `expected_start/end`, `completed_at`, `cancelled_at`,
  `cancellation_reason`, `archived_at`, `code` and lineage is rejected.
  Only the approved commands may pass, through the transaction-scoped
  `app.op_control` flag.
- `audit_catalog_change` — catalog updates are audited automatically.

### Temporal model (frozen)

- **Planned** is a baseline: editable only in `draft` and `planning`, frozen
  from `ready` onward, through `cancelled`.
- **Expected** is the forecast: requires a reason, never rewrites planned, and
  does not exist for `completed`/`cancelled` operations.
- **Actual** facts (`completed_at`, `cancelled_at`) are produced by the server.

### Archival

`archived_at` is orthogonal to outcome. An archived operation keeps its
`completed` or `cancelled` status. There is no `archived` status.

### Consistency

Composite foreign keys `(experience_id, tenant_id)` and
`(offering_id, tenant_id, experience_id)` plus a CHECK make it impossible for a
format or operation to reference another tenant's rows, or for an operation to
carry an offering without its experience.

### Metadata rule

`metadata jsonb` is extension-only. No rule, policy, guard, command or UI
behavior reads it. Canonical truth is always a column.

## Verification result (W02 Security Gate)

- W02 SECURITY GATE: PASS
- TENANT RLS REAL TESTED: YES
- CROSS TENANT LEAK FOUND: NO
- W02 ARCHITECTURE FROZEN: YES

75 assertions executed against the live database with real authenticated
sessions across two real tenants and four roles, plus browser verification of
every W02 route for owner, operations_agent and member.

Hotfixes applied during the gate (all architecture-preserving):
least-privilege grants narrowed on the three W02 tables; `operations_agent`
lifecycle controls aligned with backend authorization; forecast form hidden on
terminal operations; organization context wired to the real active tenant.

## Cleanup & freeze (2026-08-10)

All verification residue was removed through a single one-shot development
maintenance migration: 4 test tenants, 8 test accounts, 3 experiences,
2 offerings, 5 operations, 29 audit rows and every related identity and
idempotency record. The append-only audit protection and the membership guard
were disabled only inside that maintenance step and re-enabled in the same
statement. No permanent audit-deleting product function exists.

Post-cleanup counts are zero for all ten W01/W02 tables and for auth accounts.
RLS remains enabled on all ten tables, `anon` holds no privileges on any of
them, and all fourteen triggers are enabled.

## Frozen contract

W00, W01 and W02 are frozen. W03+ must extend, never redefine: no new status
column on operations, no second audit trail, no direct writes to protected
columns, no tenant-unscoped table, no reintroduction of `anon` privileges.
