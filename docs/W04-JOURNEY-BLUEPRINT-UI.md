# W04 — Journey Blueprint UI MVP (POST_PILOT_RELEASE_05 · gap closure 05.1)

Status: IMPLEMENTED (UI only). Backend contract unchanged (see
`docs/W04-JOURNEY-BLUEPRINT-BACKEND.md`). No blueprint was created or applied
in production. Golden Pilot `CITYTO-20260815` and `CITYES-20260811` untouched.

## Scope

Minimum operator interface to administer, publish and apply versioned journey
blueprints using only the installed SECURITY DEFINER RPCs. No direct DML, no
new database objects, no changes to the presence contract.

## Surfaces

| Route | Purpose |
| --- | --- |
| `/blueprints` | Tenant blueprint list + create dialog (**no search in the MVP**) |
| `/blueprints/$blueprintId` | Draft editor, validation, publication, version history, archive |
| `/operations/$operationId/journey` | "Apply blueprint" action with step preview, effective anchor, origin banner and per-step origin chips |

Navigation entry: **Roteiros** (`src/lib/navigation.ts`, Map icon).

## Files

- `src/lib/blueprints.ts` — types, role helpers, offset formatting, RPC payload
  builders, result readers, error humanization, slug normalization.
- `src/lib/i18n-blueprints.ts` — pt-BR / en-US (es-ES aliased to en-US).
- `src/routes/_authenticated/blueprints.index.tsx` — list + create.
- `src/routes/_authenticated/blueprints.$blueprintId.tsx` — editor.
- `src/routes/_authenticated/operations.$operationId.journey.tsx` — apply dialog,
  provisioning origin.

## RPCs consumed

`create_journey_blueprint`, `create_blueprint_version`, `add_blueprint_step`,
`update_blueprint_step`, `remove_blueprint_step`, `reorder_blueprint_steps`,
`validate_blueprint_version`, `publish_blueprint_version`,
`archive_journey_blueprint`, `apply_journey_blueprint_to_operation`.
Reads go through RLS-protected SELECTs on the four blueprint tables.

## Rules enforced in the interface

1. **Only draft versions are editable.** Published and archived versions render
   read-only with a lock marker, checksum and published timestamp.
2. **Presence contract is never duplicated.** The step dialog imports
   `allowedPresenceRequirements` / `defaultPresenceRequirement` from
   `@/lib/w04`; changing the step kind resets the requirement to the canonical
   value, and the canonical value is sent as NULL so the backend applies it.
3. **Publication requires a successful validation in the same session.** The
   publish button stays disabled until `validate_blueprint_version` returns
   `valid: true`; violations render with code, step sequence and message.
4. **Roles.** view = any member; edit/create/apply = owner, admin,
   operations_agent; publish/archive = owner, admin. The UI mirrors the RPC
   checks — it never replaces them.
5. **Application is one-shot and atomic.** The action only appears for a
   `draft`/`planning` operation with zero journey steps and no existing
   provisioning; after success the page shows the provisioning origin banner.
6. **Idempotency keys** are generated per dialog opening and kept stable across
   retries of the same submission.
8. **Step preview before application.** Selecting a published version loads its
   steps (RLS-scoped, ordered by `sequence`) and renders sequence, title, kind,
   relative offset, duration, computed start/end instants, effective presence
   requirement/population and the traveler-facing flag. Instants are rendered in
   the operation time zone. Preview states: loading, error, empty, ready.
9. **Effective anchor.** `effectiveAnchor = manual value || operation.planned_start`.
   The dialog always states "Times will be calculated from: <instant>" and whether
   it comes from the planned start or from a manual override (which replaces the
   planned reference for this provisioning only). With neither, a specific error
   shows, confirmation is blocked and the RPC is never called. Invalid dates never
   produce a payload.
10. **Confirmation gating.** `canSubmitApplication` is the single decision point:
    disabled while the preview is loading, on preview error, with no selected
    version, with a version that has no steps, or without a valid effective anchor.
11. **Payload.** Exactly `_operation_id`, `_version_id`, `_idempotency_key`, plus
    `_anchor_start` only on a manual override. `_allow_existing_journey` does not
    exist anywhere in the surface; there is no merge, replacement or
    re-provisioning, and no direct DML.
12. **Journey origin.** The banner shows blueprint name, version number, short
    checksum, step count and application timestamp, resolved from a single joined
    query. No UUID is displayed. The applier is omitted because it cannot be
    resolved from an authorized source without a broad profile lookup.
13. **Per-step origin chip.** Steps carrying both `source_blueprint_version_id`
    and `source_blueprint_step_id` matching the provisioned version show
    "Origem: roteiro <name> v<N>", using data already loaded for the banner (no
    per-step query). Null source ids are normal and render nothing.
7. **Errors** are always humanized (`humanizeBlueprintError`); no raw SQL text
   reaches the operator.

## Localization

pt-BR and en-US are complete. **es-ES deliberately inherits en-US**
(`BLUEPRINT_ES = { ...BLUEPRINT_EN }`) — a full Spanish translation is a
post-release task, not a defect.

## Verification

- `bun test src/lib/blueprints.test.ts`: 29 tests, all passing (pure functions:
  offsets, preview instants, effective anchor, ordering, effective requirement,
  slug, error humanization, payload shape, submission gating, origin/chip
  formatting, checksum abbreviation, idempotency stability).
- Component-level tests (dialog gating, banner rendering, chip visibility) are
  NOT_RUN: the project has no component-test infrastructure and none was added.
- `tsgo --noEmit`: clean.
- `bun run build`: clean.
- Routes `/blueprints` and `/blueprints/:id` served 200 by the dev server with
  the route tree regenerated.
- Structural validation only. Authenticated visual walkthrough remains
  UNVERIFIED (preview session injection limitation, as with W06/W07); it must
  never be declared visually approved.

## Post-release improvements (accepted, non-blocking)

- L1: search/filter on the blueprint list.
- L5: full es-ES translation (currently inherits en-US, documented above).
- L7: route-level `errorComponent` / `notFoundComponent` for the blueprint routes.

## Not in scope

Blueprint duplication across tenants, import/export, step-level diffing between
versions, and blueprint analytics.
