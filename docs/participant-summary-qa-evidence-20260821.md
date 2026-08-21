# Participant summary QA evidence — 2026-08-21

Executed against Supabase project `COBS OS CLEAN BUILD` using the public command path inside a single transaction that was rolled back at the end. No QA operation or participant mutation was persisted.

## Scenario

Three existing people were added as `participant` rows to a disposable operation. The test used the canonical RPCs/functions for operation creation, roster membership, participation confirmation, journey step creation, lifecycle transitions, journey start/completion, presence facts, boarding and operation completion.

Observed canonical results from `public.get_operation_participant_summary(operation_id)`:

| Stage | planned | confirmed | unconfirmed | present | boarded | no_show | health |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Planned roster | 3 | 0 | 3 | 0 | 0 | 0 | under_control |
| All confirmed | 3 | 3 | 0 | 0 | 0 | 0 | under_control |
| A+B present, C no-show | 3 | 3 | 0 | 2 | 0 | 1 | attention / CONFIRMED_NO_SHOWS |
| A+B boarded, C no-show | 3 | 3 | 0 | 2 | 2 | 1 | attention / CONFIRMED_NO_SHOWS |
| Operation completed | 3 | 3 | 0 | 2 | 2 | 1 | under_control |

## Result

PASS for the canonical participant counters and health semantics.

The final terminal state intentionally preserves historical counters while clearing live attention. During active execution, the explicit no-show remains an actionable attention reason. No missing information was inferred as confirmation, presence, boarding or no-show.

The transaction was rolled back after the assertions, so the database remains free of QA residue.
