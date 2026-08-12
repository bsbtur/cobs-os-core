# W04 — Journey Blueprint UI MVP (POST_PILOT_RELEASE_05)

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
| `/blueprints` | Tenant blueprint list, search, create dialog |
| `/blueprints/$blueprintId` | Draft editor, validation, publication, version history, archive |
| `/operations/$operationId/journey` | "Apply blueprint" action + provisioning origin banner |

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
7. **Errors** are always humanized (`humanizeBlueprintError`); no raw SQL text
   reaches the operator.

## Verification

- `tsgo --noEmit`: clean.
- Routes `/blueprints` and `/blueprints/:id` served 200 by the dev server with
  the route tree regenerated.
- Structural validation only. Authenticated visual walkthrough remains
  UNVERIFIED (preview session injection limitation, as with W06/W07); it must
  never be declared visually approved.

## Not in scope

Blueprint duplication across tenants, import/export, step-level diffing between
versions, and blueprint analytics.
