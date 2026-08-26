# V3.1-B — GATE B3 Contract Integrity / E2E

Date: 2026-08-26
Environment: COBS OS sandbox QA (`mkjuoijrtbporbjkztla`). CLEAN BUILD/main not touched.

## Scope

- insufficient-evidence contract
- model/version contract
- snapshot/evidence invariants
- RLS and RPC surface
- B1 six-scenario regression
- compatibility with B2 persistence/freeze semantics

## Evidence

### Model/versioning
- `operational_excellence_v1`, version `1`, is the single active model.
- Weights: Journey 30, Temporal 25, Compliance 20, Flow 15, Communication 10.
- Classification thresholds: Gold >=90, Silver >=80, Bronze >=70.
- Unique active-model and final-snapshot indexes remain in place.

### Six-scenario B1 regression
| Scenario | Result |
|---|---|
| 100 / Gold | PASS — 100 Gold |
| 94 / Gold | PASS — 94 Gold |
| Silver | PASS — 84 Silver |
| Traceability loss | PASS — 85 Silver (15-point loss) |
| Insufficient evidence | PASS — score/classification null; status insufficient_evidence |
| No-show correctly treated / N/A dimension | PASS — N/A weight renormalizes; 100 Gold |

### Persistence/invariants
- Added DB CHECK contract for `insufficient_evidence`, `provisional`, and `final` snapshot states.
- Final requires `finalized_at`; provisional/insufficient prohibit it.
- Scored snapshots must stay inside 0..100 and use a known classification.
- Evidence points cannot be negative or exceed points possible.
- Existing QA snapshots have evidence-row count equal to `dimension_scores` count (0 mismatches).
- B2 final freeze/idempotency remains intact.

### Security
- `evaluate_operational_excellence` is executable only by authenticated/service_role.
- Internal collector/scorer/audit helpers remain postgres-only.
- Snapshot/evidence/audit SELECT policies are tenant-membership scoped.
- Model SELECT policy exposes only active model(s).
- Non-member evaluation was previously proven to raise `forbidden` in B2.

## Important limitation

The canonical collector currently marks Communication N/A until a canonical operation-scoped communication projection exists. Therefore the engine correctly renormalizes applicable dimensions instead of fabricating communication evidence. This is intentional and is not a gate failure.

The `insufficient_evidence` mathematical contract is green and DB persistence now enforces its shape. A dedicated end-to-end fixture whose canonical collector naturally emits missing evidence should remain in automated integration tests; the current QA fixture has complete applicable canonical evidence after B2 mutation.

## Decision

**GATE B3 — PASS WITH TEST-AUTOMATION FOLLOW-UP.**

Backend contract is sufficiently coherent to begin the visual/read-only Operational Excellence Score layer on the isolated V3.1-B branch. Do not expose score editing, manual classification, or client-side recomputation. UI must render the canonical persisted snapshot/evidence only.
