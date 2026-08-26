# V3.1-B1 — Operational Excellence Score Foundation QA

## Scope

Validation of the versioned formula/evidence contract and deterministic scoring engine in the isolated `COBS OS` QA sandbox. Production/CLEAN BUILD was not modified.

## Migration

`20260826190000_v31b_operational_excellence_score_foundation.sql`

Creates:

- `operational_score_models`
- `operational_excellence_snapshots`
- `operational_score_evidence`
- `app_private.score_operational_dimensions(...)`
- `app_private.collect_operational_excellence_facts(...)`
- `public.evaluate_operational_excellence(...)`

The public evaluator accepts only `operation_id` + `finalize`; score values are never supplied by the client.

## Formula contract

V1 weights:

- journey execution: 30
- temporal precision: 25
- operational compliance: 20
- flow traceability: 15
- communication readiness: 10

Weights total 100. `not_applicable` dimensions are redistributed proportionally. Any applicable dimension with missing evidence yields `insufficient_evidence` rather than a zero score.

Classification thresholds:

- gold >= 90
- silver >= 80
- bronze >= 70
- developing < 70

## Golden formula scenarios

| Scenario | Result | Classification | Coverage | Verdict |
| --- | ---: | --- | ---: | --- |
| perfect operation | 100.00 | gold | 100% | PASS |
| strong operation | 94.00 | gold | 100% | PASS |
| moderate delays but compliant | 87.50 (88 rounded) | silver | 100% | PASS |
| traceability loss | 86.00 | silver | 100% | PASS |
| missing canonical evidence | no score | none | 66.67% | PASS — insufficient_evidence |
| traveler no-show correctly managed | 100.00 | gold | 100% | PASS — no automatic penalty |

## Canonical-facts smoke test

The sandbox V3.1-A QA operation was read directly through `collect_operational_excellence_facts`.

Observed canonical evidence:

- journey: 1 of 2 steps completed => ratio 0.5;
- temporal: no planned timestamps => not applicable;
- operational compliance: 0 of 1 required visit points evidenced => ratio 0;
- flow traceability: no flow step kinds in the sandbox fixture => not applicable;
- communication: canonical operation-scoped communication projection is not present in this legacy sandbox => not applicable.

After proportional redistribution across the two applicable dimensions, the deterministic result was 30 / developing. This smoke test proves that the engine consumes database facts rather than client-submitted percentages.

## Important limitation

The legacy secondary sandbox does not expose the current operation-scoped communication projection, so communication readiness is deliberately `not_applicable` there. V3.1-B must not infer communication quality from unrelated `cobs_messages` data.

## Gate status

### GATE B1 — Formula & Evidence Contract: PASS

Proven:

- versioned model;
- weights total 100;
- deterministic bands;
- missing evidence behavior;
- not-applicable redistribution;
- canonical server-side fact collection;
- no-show does not automatically punish operator quality.

### GATE B2 — Persistence & Idempotency: NEXT

Still to prove end-to-end:

- provisional snapshot creation;
- identical retry returns the same canonical evaluation;
- changed facts create a new provisional fingerprint;
- concurrent evaluation convergence;
- terminal finalization;
- retry after finalization returns the frozen score;
- snapshot/evidence RLS and tenant isolation.

### GATE B3 — Golden Scenarios: FORMULA PASS / END-TO-END PENDING

The deterministic scoring kernel passes all six requested golden scenarios. Full persistence scenarios remain gated on B2.
