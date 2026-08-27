# V3.1-B — B5.4 Runtime → Operational Excellence E2E QA

Date: 2026-08-26
Branch: `feat/v3.1-b5-runtime-integration`
Sandbox QA: `mkjuoijrtbporbjkztla` (COBS OS)
CLEAN BUILD/main: not touched

## Objective

Prove the end-to-end chain:

`complete operation -> lifecycle RPC returns canonical snapshot -> final snapshot persists -> read-only Operational Excellence view loads that exact snapshot`

## Runtime generation

QA operation: `7debadf3-defe-4645-a81c-6fbc5be17905` (`V31B-B4-QA-94`).

Before the B5.4 run the fixture was committed back to:

- `status = active`
- `completed_at = NULL`
- zero Operational Excellence snapshots/evidence/audit rows

The sandbox lifecycle RPC was then invoked as an authenticated tenant member.

Runtime result:

- operation status: `completed`
- score: `94.44`
- rounded score: `94`
- classification: `gold`
- score status: `final`
- frozen: `true`
- model: `operational_excellence_v1`
- model version: `1`
- coverage: `100`
- runtime snapshot id: `7c9f79e1-6def-4152-90eb-31dd9950c000`

## Runtime read projection

A QA-only function was added and applied only to the sandbox:

`get_v31b_b5_runtime_excellence(p_snapshot_id uuid)`

It accepts only a final snapshot belonging to the synthetic B4/B5 fixture and returns the canonical operation + snapshot + model + persisted evidence. It does not recalculate score.

Calling it with the exact runtime snapshot id returned:

- same snapshot id: `7c9f79e1-6def-4152-90eb-31dd9950c000`
- same score: `94.44`
- same rounded score: `94`
- same classification: `gold`
- same operation status: `completed`
- 5 persisted evidence rows
- facts fingerprint: `29d06bade910c4eb0d681a5580e8dbfa`

Dimension evidence:

1. Journey execution: 33.33 / 33.33 — 2/2 completed
2. Temporal precision: 22.22 / 27.78 — one 10-minute delay
3. Operational compliance: 22.22 / 22.22 — 1/1 required point
4. Flow traceability: 16.67 / 16.67 — 1/1 flow step
5. Communication readiness: N/A — no canonical operation communication projection

## Mobile binding

The frozen `/qa/operational-excellence` experience now supports a `snapshot=<uuid>` query parameter. When present it calls the B5.4 runtime projection and verifies that the returned snapshot id is exactly the id supplied by the lifecycle result.

The deployment for commit `14b4fb8113cc5a6daf34aa38d7e08d109b5ce5c9` is READY and `/qa/operational-excellence?snapshot=7c9f79e1-6def-4152-90eb-31dd9950c000` returns HTTP 200.

## Current gate status

Backend/runtime E2E: **PASS**.
Canonical snapshot identity: **PASS**.
Five persisted evidences: **PASS**.
Read-only projection: **PASS**.
Deployment: **PASS**.

Final Mobile QA: **PENDING USER DEVICE TEST**.

B5.4 may be frozen only after the mobile page displays the same 94 / Gold result and the runtime snapshot id without layout regression.
