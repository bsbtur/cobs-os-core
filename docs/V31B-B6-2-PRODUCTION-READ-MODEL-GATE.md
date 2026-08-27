# V3.1-B6.2 — Production Read Model & Authorization Gate

Date: 2026-08-26
Branch: `feat/v3.1-b6-product-integration`
Sandbox QA: `mkjuoijrtbporbjkztla`
Main/CLEAN BUILD: untouched

## Objective

Replace QA snapshot lookup with a production read boundary that accepts only `operation_id`, resolves the caller and tenant server-side, returns only the canonical terminal Operational Excellence snapshot + evidence, and exposes no score mutation/recalculation surface to product roles.

## Implemented contract

RPC: `public.get_operation_excellence(_operation_id uuid)`

Properties:

- `SECURITY DEFINER`
- fixed `search_path = pg_catalog, public, app_private`
- anonymous execution revoked
- authenticated execution granted
- caller derived from `auth.uid()`
- tenant membership validated server-side
- browser supplies only `operation_id`
- active/non-completed operations return `available=false`
- cancelled operations return `available=false, reason=cancelled`
- completed operations resolve the canonical final/terminal snapshot server-side
- evidence is constrained by both `snapshot_id` and operation tenant
- no score calculation is performed by the read RPC

B6.2 also hardens the internal evaluator:

- `evaluate_operational_excellence(uuid, boolean)` EXECUTE revoked from `authenticated` and `anon`
- service role retains execution
- legacy QA projections `get_v31b_b4_qa_excellence()` and `get_v31b_b5_runtime_excellence(uuid)` have `anon/authenticated` execution revoked when present

## Adversarial matrix

### T01 — Tenant A reads completed Tenant A operation

**PASS.**

Authenticated role + BSBTUR member successfully called `get_operation_excellence(operation_id)`.

Returned canonical runtime result:

- snapshot: `7c9f79e1-6def-4152-90eb-31dd9950c000`
- score: `94.44`
- rounded score: `94`
- classification: `gold`
- evaluation status: `final`
- coverage: `100`
- evidence rows: `5`

### T02 — Tenant A attempts Tenant B operation_id

**PASS / DENY.**

A temporary isolated Tenant B fixture was created in the sandbox. Tenant A caller received:

`42501 operation_not_found_or_forbidden`

No operation name, tenant id, score, snapshot id or evidence was returned.

The temporary Tenant B fixture was removed after the gate.

### T03 — Anonymous caller

**PASS / DENY.**

With database role `anon`, execution failed before data access:

`42501 permission denied for function get_operation_excellence`

The function also contains an explicit `auth.uid() is null -> unauthenticated` guard for defense in depth.

### T04 — Active operation

**PASS.**

An existing active sandbox operation returned:

- `available=false`
- `reason=not_completed`
- no final score/classification/snapshot/evidence

### T05 — Cancelled operation

**PASS.**

A temporary cancelled same-tenant fixture returned:

- `available=false`
- `reason=cancelled`
- no Gold/Silver/Bronze medal or score payload

Fixture removed after the gate.

### T06 — Completed operation has exactly one canonical final snapshot

**PASS.**

For the runtime QA operation:

- final snapshots: `1`
- total snapshots: `1`

### T07 — Retry returns identical canonical result

**PASS.**

Two consecutive reads returned:

- first snapshot: `7c9f79e1-6def-4152-90eb-31dd9950c000`
- second snapshot: `7c9f79e1-6def-4152-90eb-31dd9950c000`
- first score: `94.44`
- second score: `94.44`
- evidence count: `5` / `5`

Read retry creates no new snapshot or evidence.

### T08 — Snapshot UUID injection impossible in product contract

**PASS.**

The only product read signature is:

`get_operation_excellence(_operation_id uuid)`

There is no product parameter for snapshot id, tenant id, score, classification or model version.

Legacy QA snapshot-UUID projection execution is revoked from `anon` and `authenticated`.

### T09 — Frontend/product role cannot recalculate or edit score

**PASS.**

Privilege audit after migration:

- `get_operation_excellence(uuid)`: authenticated EXECUTE allowed
- `evaluate_operational_excellence(uuid, boolean)`: authenticated EXECUTE removed
- QA B4 projection: authenticated/anon EXECUTE removed
- QA B5 snapshot projection: authenticated/anon EXECUTE removed

Direct call to `evaluate_operational_excellence` as database role `authenticated` failed with:

`42501 permission denied for function evaluate_operational_excellence`

The production frontend therefore has only the read boundary for Operational Excellence.

### T10 — Evidence belongs to same operation/tenant as snapshot

**PASS.**

Canonical snapshot audit:

- snapshot tenant == operation tenant
- evidence rows: `5`
- cross-tenant evidence rows: `0`
- snapshot operation id matches requested operation

## Permission/search_path audit

`get_operation_excellence(uuid)`:

- ACL: postgres, authenticated, service_role
- no anon grant
- `search_path=pg_catalog, public, app_private`

`evaluate_operational_excellence(uuid, boolean)`:

- ACL: postgres, service_role
- authenticated/anon removed
- `search_path=pg_catalog, public, app_private`

QA read functions, when present:

- ACL restricted to postgres/service_role

## Gate result

# B6.2 — PASS ✅

Score: **10/10 adversarial checks green.**

No product UI was added in this gate.

Next gate: **B6.3 — UI Product Integration**.

Product topology remains:

`Operations -> Operation Overview -> Excellence summary -> /operations/:operationId/excellence`
