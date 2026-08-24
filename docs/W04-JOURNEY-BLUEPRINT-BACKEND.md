# Journey Blueprint Backend MVP (POST_PILOT_RELEASE_04)

Reusable, versioned journey plans. Backend only — no UI in this release.
This work is **not** W11; it is an extension of the W04 journey domain.

## Model

| Table                                    | Purpose                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.journey_blueprints`              | Stable, tenant-scoped identity of a reusable itinerary (`name`, `slug`, `status active\|archived`, `default_timezone`, `metadata`). Unique `(tenant_id, slug)`. Never physically deleted.                                                               |
| `public.journey_blueprint_versions`      | Versioned, publishable content unit (`version_number`, `status draft\|published\|archived`, `notes`, `published_at/by`, `step_count`, `checksum`). Unique `(blueprint_id, version_number)`; partial unique index allows **one draft per blueprint**.    |
| `public.journey_blueprint_steps`         | Steps in **relative offsets**, never absolute dates (`sequence`, `title`, `step_kind`, `start_offset_minutes`, `duration_minutes`, labels, `traveler_facing`, `presence_requirement` nullable, `presence_population`). Unique `(version_id, sequence)`. |
| `public.operation_journey_provisionings` | One row per provisioned operation: which blueprint/version/checksum produced the journey. Unique `(operation_id)` and `(tenant_id, idempotency_key)`. Append-only.                                                                                      |

Traceability columns added to `public.journey_steps`:
`source_blueprint_version_id`, `source_blueprint_step_id` (both null on the 14 historical steps).

`presence_requirement = null` on a blueprint step means "use the canonical backend
default" (`app_private.w04_default_presence_requirement`). The W04 contract itself is unchanged.

## States

- Blueprint: `active → archived` (irreversible via RPC; archiving blocks new versions and new applications, never touches materialised journeys).
- Version: `draft → published` (irreversible, no unpublish) and `archived` for retirement.
- A published version and all of its steps are **totally immutable**; evolution is a new version.

## Enums

`public.journey_blueprint_status` (`active`, `archived`),
`public.journey_blueprint_version_status` (`draft`, `published`, `archived`).

## RPCs (all SECURITY DEFINER, safe `search_path`, auth required, idempotency key required)

| RPC                                                                                                    | Roles                          | Notes                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------- |
| `create_journey_blueprint(_tenant_id,_name,_slug,_idempotency_key,_description,_default_timezone)`     | owner, admin, operations_agent | creates blueprint + version 1 draft                                                   |
| `create_blueprint_version(_blueprint_id,_from_version_id,_idempotency_key,_notes)`                     | owner, admin, operations_agent | source must be published; clones steps with new ids; blocked when a draft is open     |
| `add_blueprint_step(_version_id,_title,_step_kind,_start_offset_minutes,_idempotency_key,_sequence,…)` | owner, admin, operations_agent | draft only; resolves effective requirement then asserts the W04 contract              |
| `update_blueprint_step(_step_id,_idempotency_key,…, _clear_duration, _clear_presence_requirement)`     | owner, admin, operations_agent | draft only; omitted fields untouched; full revalidation of the final state            |
| `remove_blueprint_step(_step_id,_idempotency_key)`                                                     | owner, admin, operations_agent | draft only; no renumbering                                                            |
| `reorder_blueprint_steps(_version_id,_ordered_step_ids,_idempotency_key)`                              | owner, admin, operations_agent | draft only; list must contain every step exactly once; renumbers 10,20,30… atomically |
| `validate_blueprint_version(_version_id)`                                                              | any member (STABLE, read-only) | returns `{valid, step_count, violations[]}`                                           |
| `publish_blueprint_version(_version_id,_idempotency_key)`                                              | owner, admin                   | freezes the version                                                                   |
| `apply_journey_blueprint_to_operation(_operation_id,_version_id,_idempotency_key,_anchor_start)`       | owner, admin, operations_agent | provisions the journey                                                                |
| `archive_journey_blueprint(_blueprint_id,_reason,_idempotency_key)`                                    | owner, admin                   | reason mandatory                                                                      |

## Publication contract

A draft publishes only when: blueprint is `active`; ≥1 step; sequences unique and
positive; offsets ≥ 0 and non-decreasing along the sequence; duration null or > 0;
titles non-empty; every step passes `app_private.w04_assert_presence_contract` on
its **effective** requirement (so no `disembarkation/none`, no `boarded` outside
`boarding`); all references tenant-consistent. On success: deterministic
`checksum` (md5 over the ordered step content), `step_count`, `published_at/by`.

## Application contract

Requires operation in `draft` or `planning`, blueprint `active`, version
`published`, everything in the same tenant, **zero** existing `journey_steps` and
no previous provisioning. Anchor = `coalesce(_anchor_start, operation.planned_start)`;
absent anchor is an error. In one transaction it revalidates the version, creates
every step with `plan_origin='planned'`,
`planned_start = anchor + start_offset_minutes`,
`planned_end = planned_start + duration_minutes`, `expected_*` left null, fills the
source references, writes exactly one provisioning row, records one aggregate audit
event and returns all steps ordered by sequence. It never creates events, presence
facts or participants, and never changes the operation status. Any failure rolls
everything back.

## Idempotency

Existing `public.idempotency_keys` mechanism, per actor and action
(`blueprint.create`, `blueprint.version_create`, `blueprint.step_add|update|remove|reorder`,
`blueprint.version_publish`, `blueprint.archive`, `journey.blueprint_apply`).
Replaying a key returns the stored result with no new write. A _different_ key
against an already-provisioned operation is rejected explicitly, enforced twice:
by check inside the RPC and by `unique (operation_id)`.

## Immutability guards (`app_private` / `public.guard_blueprint_*`)

`app_private.blueprint_control_active()` gates all DML: direct writes from the
client are rejected ("can only change through the approved commands"). Additional
triggers block: updating or deleting a published version, mutating steps of a
non-draft version, changing tenant, moving a step between versions, deleting a
blueprint, and any update/delete of a provisioning row. FKs with `restrict`
prevent deleting a blueprint or version that has been applied.

## RLS and roles

RLS enabled on all four tables, `SELECT`-only policies scoped to members of the
same tenant (`owner, admin, operations_agent, member`). No INSERT/UPDATE/DELETE
policies at all. `authenticated` has SELECT + EXECUTE on the RPCs; `anon` has no
table or function privilege; `service_role` retains full access.

## Audit

`journey_blueprint.created`, `journey_blueprint.archived`,
`journey_blueprint_version.created`, `journey_blueprint_version.published`,
`journey_blueprint_step.added|updated|removed|reordered`,
`operation.journey_provisioned`. The provisioning event carries blueprint_id,
version_id, version_number, checksum, step_count, operation_id, anchor_start and
the idempotency key as correlation id — one aggregate event, no per-step noise.

## MVP limitations

- No `experience_id` / `offering_id` link to the catalog.
- No re-provisioning, replacement or merge; an operation with any journey step is refused.
- No physical delete anywhere; archive only.
- Timezone handling is UTC-based; `default_timezone` is metadata only.
- `validate_blueprint_version` is the only read RPC; listing goes through RLS-protected SELECTs.
- **UI still pending** — blueprint list, draft editor, reorder, validate, publish, apply and origin display are not built.
