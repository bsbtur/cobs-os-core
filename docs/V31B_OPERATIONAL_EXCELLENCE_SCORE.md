# COBS Human Experience V3.1-B — Operational Excellence Score

## Status

Foundation specification for the isolated branch `feat/v3.1-b-operational-excellence-score`.

V3.1-B must not alter the frozen V1 operational flow or the V3.1-A Achievement Engine semantics. It consumes canonical operational facts and produces an explainable, versioned operation-quality snapshot.

## Product goal

Transform the facts already recorded by COBS into a trustworthy end-of-operation quality score such as:

> Operação Ouro — 94% de excelência

The score is an operational quality indicator, not a vanity metric. It must be reproducible, auditable and resistant to retries, partial data and missing evidence.

## Core principles

1. **Canonical facts only.** No score is granted from animation, client-side state or manually supplied percentages.
2. **Explainable score.** Every point gained or lost must map to an evidence item.
3. **Versioned formula.** Every snapshot stores the scoring model version used to calculate it.
4. **Idempotent evaluation.** Re-evaluating the same operation with the same facts must not create duplicate snapshots or conflicting final scores.
5. **Coverage before prestige.** If there is not enough canonical evidence, COBS returns `insufficient_evidence` instead of inventing a grade.
6. **Do not punish the operator for traveler behavior.** Passenger no-show or cancellation may be operational context, but only failures attributable to the operation should reduce excellence.
7. **Frozen operation, frozen final score.** Once an operation is terminal and the final snapshot is issued, subsequent reads must return the same final score unless an explicitly versioned audit/recalculation workflow is introduced later.

## V3.1-B MVP scope

The first version evaluates five dimensions totaling 100 weighted points.

| Dimension | Weight | What it measures |
| --- | ---: | --- |
| Journey execution | 30 | Completion integrity of required journey stages and mandatory visit requirements |
| Temporal precision | 25 | Schedule adherence and attributable delay control |
| Operational compliance | 20 | Completion of mandatory operational requirements/checklists/evidence |
| Flow traceability | 15 | Whether critical passenger/team movements were properly registered when applicable |
| Communication readiness | 10 | Whether required operational communication/alert actions were recorded when applicable |

The formula must be implemented as a configurable, versioned scoring model rather than hard-coded UI logic.

## Classification bands

Initial public-facing classifications:

- **Ouro:** 90–100
- **Prata:** 80–89
- **Bronze:** 70–79
- **Em evolução:** 0–69
- **Sem classificação:** insufficient canonical evidence

The user-facing percentage is the rounded final weighted score. Example: a score of `93.6` renders as **Operação Ouro — 94%**.

## Evidence coverage gate

A final classification is allowed only when all of the following are true:

- the operation is terminal/completed;
- required journey data is available;
- every applicable scoring dimension has enough canonical facts to be evaluated or is explicitly marked `not_applicable`;
- the evaluator can identify the scoring model version;
- no unresolved integrity error exists in the evidence set.

If a dimension is not applicable, its weight is redistributed proportionally across the applicable dimensions. If a dimension is applicable but its evidence is missing, the result is `insufficient_evidence`, not zero.

## Data model proposal

### `operational_score_models`

Versioned scoring configuration.

Suggested fields:

- `id uuid primary key`
- `model_key text`
- `version integer`
- `status text` (`draft`, `active`, `retired`)
- `weights jsonb`
- `rules jsonb`
- `created_at timestamptz`
- unique `(model_key, version)`

### `operational_excellence_snapshots`

One canonical evaluation snapshot per operation/model/finality state.

Suggested fields:

- `id uuid primary key`
- `operation_id uuid not null`
- `model_id uuid not null`
- `score numeric(5,2)`
- `rounded_score integer`
- `classification text`
- `evaluation_status text` (`provisional`, `final`, `insufficient_evidence`)
- `coverage_percent numeric(5,2)`
- `dimension_scores jsonb`
- `evidence_summary jsonb`
- `evaluated_at timestamptz`
- `finalized_at timestamptz null`
- `facts_fingerprint text`
- unique constraint for canonical final snapshot per `(operation_id, model_id)`

### `operational_score_evidence`

Optional normalized audit trail for detailed explainability.

Suggested fields:

- `id uuid primary key`
- `snapshot_id uuid not null`
- `dimension_key text`
- `rule_key text`
- `outcome text` (`pass`, `partial`, `fail`, `not_applicable`, `missing`)
- `points_awarded numeric(6,2)`
- `points_possible numeric(6,2)`
- `source_type text`
- `source_id uuid null`
- `evidence jsonb`
- `created_at timestamptz`

## Evaluator contract

Proposed RPC/server contract:

`evaluate_operational_excellence(operation_id, finalize boolean default false)`

Returns:

```json
{
  "operation_id": "...",
  "model": "operational_excellence_v1",
  "model_version": 1,
  "status": "provisional | final | insufficient_evidence",
  "score": 93.6,
  "rounded_score": 94,
  "classification": "gold",
  "coverage_percent": 100,
  "dimensions": [
    {
      "key": "journey_execution",
      "score": 28.5,
      "max": 30,
      "evidence": []
    }
  ]
}
```

## Dimension rules — MVP direction

### 1. Journey execution — 30 points

Measure completion integrity from canonical journey facts.

Initial rule intent:

- all mandatory journey stages terminal/completed;
- mandatory visit requirements satisfied;
- no invalid completion state;
- optional points may improve evidence richness but must not be required beyond configured minimums.

### 2. Temporal precision — 25 points

Measure attributable schedule adherence from canonical stage timing.

Initial rule intent:

- compare actual milestone timestamps with planned times where both exist;
- use tolerance bands instead of binary punctual/late logic;
- exclude delays explicitly classified as external/non-attributable when that classification is supported by canonical data in a future version;
- never infer a delay from missing timestamps.

### 3. Operational compliance — 20 points

Measure mandatory operational requirements.

Initial rule intent:

- required checklist/evidence completion;
- mandatory confirmations recorded;
- no bypass of completion guards.

### 4. Flow traceability — 15 points

Measure registration completeness for critical movement events when applicable.

Initial rule intent:

- required check-in/boarding/disembarkation/presence facts recorded for applicable operation types;
- passenger no-show itself does not reduce the score if the no-show was correctly registered and managed;
- missing required operational traceability may reduce the score.

### 5. Communication readiness — 10 points

Measure whether required communication actions were registered when applicable.

Initial rule intent:

- required operational notices/alerts recorded;
- required exception communication recorded when a qualifying exception occurred;
- absence of an incident does not create artificial bonus points.

## Anti-gaming and integrity controls

- client never submits the final score;
- evaluator reads database facts directly;
- retry must be idempotent;
- concurrent evaluations must converge on one canonical snapshot;
- `facts_fingerprint` detects whether provisional evidence changed;
- final snapshot cannot be silently overwritten;
- evidence must be tenant-scoped and protected by RLS/service boundary rules consistent with COBS architecture;
- score UI must never display a classification when evaluator status is `insufficient_evidence`.

## Product UX — first release

The final operation card may show:

**Operação Ouro**  
**94% de excelência**

Then a compact breakdown:

- Jornada: 95%
- Pontualidade: 92%
- Conformidade: 100%
- Rastreabilidade: 93%
- Comunicação: 88%

The first release should avoid competitive leaderboards. The score is initially an internal improvement and quality-management instrument.

## Gate plan

### GATE B1 — Formula & Evidence Contract

Pass criteria:

- model versioning defined;
- dimension weights total 100;
- missing evidence behavior defined;
- `not_applicable` redistribution defined;
- classification thresholds deterministic;
- final score reproducible from canonical facts.

### GATE B2 — Persistence & Idempotency

Test matrix:

- provisional evaluation;
- retry with identical facts;
- retry after facts change;
- concurrent evaluation;
- insufficient evidence;
- terminal finalization;
- retry after finalization;
- audit of snapshot + evidence rows.

### GATE B3 — Golden Scenarios

Controlled scenarios:

- perfect operation → 100 / Ouro;
- strong operation → approximately 94 / Ouro;
- moderate delays but compliant → Prata;
- incomplete traceability → reduced score;
- missing canonical evidence → Sem classificação;
- passenger no-show correctly recorded → no automatic operator penalty.

### GATE B4 — UI

Only after evaluator and persistence pass:

`Operação concluída → score calculated → classification revealed → dimension breakdown → improvement insight`

## Out of scope for V3.1-B MVP

- public ranking between companies;
- employee compensation based directly on score;
- participant satisfaction/NPS as a mandatory dimension;
- AI-generated score overrides;
- manual score editing;
- cross-company benchmarking without normalization;
- predictive scoring.

These may become later modules once the evidence base is mature.

## Strategic extension

A later analytics layer can aggregate final snapshots by operation type, destination, team, guide, supplier, route and period. This can become a defensible operational intelligence asset for COBS: not merely gamification, but a measurable quality standard for tourism and event operations.
