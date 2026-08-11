# DEF-PILOT-023 — Movement step completion invariant

**Severity:** P1 (operational)
**Status:** REGISTERED — no code, schema, RLS or data change applied
**Detected:** 2026-08-11, LIVE_TEST_03_17_ACCIDENT_AUDIT, operation CITYES-20260811
**Apply window:** post-pilot only. MUST NOT be applied while CITYES-20260811 is live.

## Problem (confirmed in live test)

A journey step with `step_kind = movement` accepted `STEP_COMPLETED` without any
`ARRIVED` milestone on the same step.

Evidence — operation `2d581923-534a-4fd6-8442-55ac425152ec`, sequence 30
"Deslocamento de ida" (`3a9187af-6063-4508-a388-3de865251c8b`):

- `STEP_STARTED` — `5cc124c8-3cf8-4492-9938-90acead84db9` @ 2026-08-11 23:20:48 UTC
- `ARRIVED` — **0 events**
- `STEP_COMPLETED` — `4b54be6e-7814-4bba-9723-5d43aec5f0ab` @ 2026-08-11 23:30:50 UTC

No unexpected writes. Operation remained `active`. Golden Pilot CITYTO-20260815
untouched. Data is internally consistent but the timeline is semantically
incomplete: the arrival fact was never recorded.

## Root cause

- **Backend:** `public.complete_journey_step` validates only role, tenant and the
  presence of `STEP_STARTED`. There is no `step_kind`-specific validation and no
  requirement for mobility milestones.
- **Frontend:** "Concluir etapa" is `gated: true`, i.e. disabled only while
  readiness is false. Sequence 30 has `presence_requirement = none`, so readiness
  is trivially true and the button was enabled from the moment the step started,
  adjacent to the ungated "Registrar chegada".

## Approved correction (post-pilot)

1. **Backend (mandatory, source of truth).** In `public.complete_journey_step`,
   when the step kind represents movement (`movement`, `return`), require an
   `ARRIVED` milestone on that step before allowing `STEP_COMPLETED`; otherwise
   raise a domain error.
2. **Frontend (complementary).** Disable "Concluir etapa" on movement steps while
   no `ARRIVED` event exists on the step, mirroring the backend invariant.
3. **Append-only preserved.** Guard by rejecting the invalid command; never update
   or delete existing runtime history, and add no reversal command.

Both layers are required. The frontend gate is UX only and never substitutes the
backend invariant.

## Classification

`TEST_DATA_RECOVERABLE` + `BACKEND_INVARIANT_DEFECT`, with a derived
`UI_GATING_DEFECT`. Not a product-rule defect: the rule exists, it was simply not
encoded.

## Decision

Registered as P1 operational. No immediate change. Implementation is deferred to
the post-pilot amendment window and requires an explicit authorization, like every
post-freeze W04 amendment.
