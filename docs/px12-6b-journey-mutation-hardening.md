# PX12.6-B — Journey Mutation & Action Hardening

Status: **BACKEND HARDENED / UI FOLLOW-UP OPEN**

Date: 2026-08-15

## Objective

Make Journey planning mutations safe against accidental or out-of-band historical rewrites while preserving the W04 constitution:

- Planned != Expected != Actual
- runtime history is append-only
- baseline freezes from `ready` onward
- forecast remains mutable through the approved expected-window command
- removals preserve history rather than physically deleting operational truth

## Implemented

### Journey correction management

The Journey management panel now exposes explicit correction states instead of silently disappearing:

- edit planned steps in `draft` / `planning`
- archive eligible manually-created steps with a required reason
- edit checklist definitions while planning
- deactivate checklist items with a required reason
- show explicit frozen-state messaging from `ready` onward
- show loading/error/empty states rather than hiding the panel
- block dialog closure while destructive/save mutations are pending
- validate edited planned windows before submission

Commit: `32732be4bab0922c577a80d0fd283b1b06fab4f0`

### Database mutation hardening

Migration: `20260815193000_px12_6b_journey_mutation_hardening.sql`

Commit: `9a01171e452e2ed96ab5f87edff401d5e6445945`

The migration adds defensive invariants:

1. New/updated Journey rows cannot persist an inverted planned window.
2. New/updated Journey rows cannot persist an inverted expected window.
3. New/updated Journey steps cannot have a blank title.
4. New/updated checklist items cannot have a blank title.
5. From `ready` onward, Journey planning metadata cannot be rewritten; only expected-window fields remain mutable.
6. Checklist definitions are frozen from `ready` onward. Runtime completion/reopen continues to use append-only `playbook_executions`.
7. Trigger helper functions are not exposed as authenticated RPC surfaces.

The constraints are introduced as `NOT VALID` so historical rows are not retroactively rejected, while PostgreSQL still enforces the constraints for new/updated rows.

## Why the backend gate was required

Before this hardening, the UI hid management actions after baseline freeze, but approved RPCs could still be called by another client or future automation to alter non-temporal Journey metadata or checklist definitions. UI hiding is not an authorization/integrity boundary.

The database now owns that invariant.

## Existing W04 behavior preserved

- `set_step_expected_window` remains legal before terminal operation state and continues to write forecast + factual/audit events.
- ad-hoc Journey steps remain the approved mechanism for new reality after baseline freeze.
- no runtime Journey event is updated or deleted.
- no presence fact is updated or deleted.
- no playbook execution fact is updated or deleted.
- no production data was modified by this code-only change.

## Remaining UI follow-up

The main Journey plan screen still deserves a final client-side hardening pass for:

- stable idempotency key across a checklist-create retry intent
- client-side inverted-window feedback before RPC submission on create/forecast flows
- explicit retry UI when the blueprint catalog/preview query fails
- consistent pending labels and dialog close protection across all creation mutations

These are UX/retry-quality improvements. The database-level baseline integrity issue is closed by the migration above.

## Deployment check note

GitHub reports the same Vercel `failure` status for commits `46b90775`, `32732be4`, and `9a01171e`. Therefore the Vercel failure predates this backend hardening and is tracked separately as a preview/deployment integration issue rather than evidence that this migration introduced a build regression.
