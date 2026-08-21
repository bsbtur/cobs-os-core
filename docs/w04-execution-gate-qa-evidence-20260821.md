# W04 execution gate QA evidence — 2026-08-21

Executed against Supabase project `COBS OS CLEAN BUILD` using the canonical public lifecycle/journey commands in a single transaction. The transaction was rolled back, so no QA operation or journey facts were persisted.

## Observed gate matrix

| Stage | Operation status | can_start_next | Block code | Expected operator behavior |
| --- | --- | --- | --- | --- |
| Draft with next step | draft | false | OPERATION_NOT_READY | Start action disabled; explain that lifecycle must advance to Pronta |
| Planning with next step | planning | false | OPERATION_NOT_READY | Start action disabled; explain that lifecycle must advance to Pronta |
| Ready with next step | ready | true | null | Start action enabled |
| Active with an open step | active | false | STEP_ALREADY_ACTIVE | Do not offer another start action; finish/skip current step |
| Active after current resolved, another step exists | active | true | null | Start next action enabled |
| Active after all steps resolved | active | false | NO_NEXT_STEP | No start action |
| Completed | completed | false | OPERATION_TERMINAL | No operational action; historical view only |

## Contract

Canonical runtime keys exposed by `public.w04_operation_runtime_state(operation_id)`:

- `can_start_next`
- `start_next_block_code`
- `start_next_block_label`

Temporary `execution_block_code` and `execution_block_label` aliases remain in the response for compatibility with any preview surface that consumed the v2 migration before the contract names were finalized.

## Result

PASS. The backend now provides a deterministic reason whenever starting the next step is invalid. The frontend should consume this state instead of rendering a clickable button and waiting for the mutation to fail.
