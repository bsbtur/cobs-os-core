# COBS OS — W02 FINAL ARCHITECTURE DELTA

Experience · Offering · Operation core. Approved with corrections. No implementation until explicit approval.

## Corrected scope

W02 creates exactly three tenant-owned business tables:

- **experiences** — reusable experience definition
- **offerings** — commercial configuration of an Experience
- **operations** — one concrete execution

No `operation_status_events`. No W03+ tables. No W01 semantic changes.

## Proposed tables

### experiences

id, tenant_id, name, slug, short_description, description?, experience_kind (tourism|event|hybrid), category_tags text[], status (draft|active|archived), default_locale, default_timezone, country_code?, region?, city?, metadata jsonb, created_by, created_at, updated_at.

- No price. No operational state.
- Unique: (tenant_id, lower(slug)).
- Lifecycle: draft → active → archived (archived → active allowed).

### offerings

id, tenant_id, experience_id (NOT NULL), name, slug, status (draft|active|paused|archived), available_from?, available_until?, sales_start?, sales_end?, capacity?, currency_code?, metadata jsonb, created_by, created_at, updated_at.

- No pricing, no payment.
- Unique: (tenant_id, experience_id, lower(slug)).
- Lifecycle: draft → active ⇄ paused → archived.

### operations

id, tenant_id, experience_id?, offering_id?, name (own copy), code (tenant-unique), operation_kind (tourism|event|hybrid), status (draft|planning|ready|active|completed|cancelled), primary_country, primary_region?, primary_city?, timezone, planned_start, planned_end, expected_start?, expected_end?, cancelled_at?, cancellation_reason?, completed_at?, archived_at?, source_experience_name?, source_offering_name?, metadata jsonb, created_by, created_at, updated_at.

- No participants, journey, mobility, hospitality, commerce, communication.
- Unique: (tenant_id, lower(code)).

## Relationships & cardinalities

experience 1—N offering (mandatory parent).  
experience 1—N operation (optional).  
offering 1—N operation (optional).  
tenant 1—N all three.

Composite FKs on (tenant_id, id) make cross-tenant linkage structurally impossible.  
Database constraint: if offering_id is set, experience_id must be set and must equal the offering's experience_id, and both must belong to the operation's tenant. Enforced at the database layer, not UI-only.

Experience on Operation is **optional** — standalone technical visits, internal events and corporate operations must be creatable without first authoring a catalog definition. Offering always requires an Experience because an Offering has no meaning without the thing it presents.

## Source of truth / snapshot

Referenced (lineage, mutable upstream): experience_id, offering_id.  
Owned by Operation (snapshotted at creation, never auto-synced): name, code, operation_kind, timezone, primary_country/region/city, planned dates, and denormalized source_experience_name / source_offering_name captured at creation.  
Not copied: descriptions, tags, capacity, currency, media. Renaming an Experience never rewrites executed history.

## Lifecycle

### Experience

draft → active → archived (archived → active allowed).

### Offering

draft → active ⇄ paused → archived.

### Operation

draft → planning → ready → active → completed.  
Cancelled from any non-completed state.  
**completed never returns to active** (trigger-enforced).

`archived` is **not** a lifecycle status for Operation. Administrative archival is orthogonal, represented by `archived_at` (and future `archived_by` / `archive_reason` if needed). A completed Operation that is archived remains `status = completed`. A cancelled Operation that is archived remains `status = cancelled`. Archival must never destroy business outcome semantics.

Experience and Offering retain their own `archived` status because those are catalog/configuration entities, not outcome-bearing executions.

## Temporal integrity

### Planned window as baseline

During `draft` and `planning`, `planned_start` / `planned_end` may be edited by authorized users; changes are audited.

Once the Operation reaches `ready`, the planned window becomes the canonical baseline and must **not** be mutated through normal product flows. This rule holds through `ready`, `active`, `completed` and `cancelled`.

Operational forecast changes from `ready` onward must use `expected_start` / `expected_end` with actor, reason and audit.

### Expected window

`expected_start` / `expected_end` is the current forecast. Changes require a reason and are audited with previous value, new value, actor and reason.

### Actual

No actual timestamps in W02. Actuals are future Journey/Runtime facts.

## RLS matrix

Uses W01 `app_private.is_tenant_member` and `app_private.has_tenant_role` only. No parallel tenant logic.

| Action | experiences                      | offerings                          | operations                   |
| ------ | -------------------------------- | ---------------------------------- | ---------------------------- |
| SELECT | is_tenant_member                 | is_tenant_member                   | is_tenant_member             |
| INSERT | owner/admin                      | owner/admin                        | owner/admin/operations_agent |
| UPDATE | owner/admin                      | owner/admin                        | owner/admin/operations_agent |
| DELETE | owner/admin (draft, no children) | owner/admin (draft, no operations) | denied                       |

member = read only. No contextual per-operation assignment (W03).

GRANTs per table: `SELECT, INSERT, UPDATE ON ... TO authenticated` (+ DELETE on experiences/offerings), `ALL TO service_role`. No anon grants anywhere.

## Idempotency, audit, functions

Idempotency reuses W01 `idempotency_keys`: client sends a key per create; replay returns the stored result. Applies to `create_experience`, `create_offering`, `create_operation`.

Public SECURITY DEFINER functions (search_path pinned, role-checked via `app_private.has_tenant_role`): `create_experience`, `create_offering`, `create_operation`, `set_operation_status`, `set_operation_expected_window`. Simple field edits go through RLS'd UPDATE, audited by trigger.

Audit via existing `app_private.record_audit_event`, metadata = ids + changed field names + old/new for lifecycle and expected-time only. No row dumps, no PII. Actions: experience.created/updated/archived, offering.created/updated/status_changed, operation.created/updated/status_changed/expected_time_changed/cancelled/completed.

## metadata jsonb rule

`metadata` is extension-only. It may contain non-canonical extension information. It must **not** be the sole source of truth for authorization, tenant ownership, relationships, lifecycle, financial values, pricing, capacity rules, sales availability, temporal integrity, critical filtering, referential integrity, business invariants, or any other operationally canonical fact. Any information that becomes canonical must graduate to a typed column or table in the appropriate bounded context.

## UX

Routes (registered in the typed nav registry, no dead links):
`/experiences`, `/experiences/$experienceId`, `/operations`, `/operations/$operationId`.

Experiences: empty state "Transforme uma ideia em uma experiência." + CTA "Criar experiência". 3-step create flow (Identidade → Contexto → Revisão) → creates Draft. Detail shows name, status, kind, description, context, its Offerings, and a real count of linked Operations.

Offerings live inside the Experience detail, user-facing label **"Formatos"** (singular "Formato"), CTA "Novo formato". Internal domain name stays Offering.

Operations: empty state "Nenhuma operação criada." / "Uma operação é a execução real de uma experiência, viagem ou evento." + CTA "Nova operação". 4-step wizard (O que vamos operar → Identidade → Quando → Revisão), idempotent create. Detail route header = name, kind, status, dates, location; a single **Visão geral** tab. No placeholder tabs.

Command Center (`/app`): real counts only — experiences, draft/planning/active operations, upcoming operations (planned_start > now). Zero data → humanized empty state, no charts.

Command palette gains Experiences + Operations lookup via two small tenant-scoped ilike queries. No global search infra. No realtime in W02.

## Globalization

ISO 3166-1 alpha-2 countries, IANA timezone, BCP 47 locale, ISO 4217 currency, all timestamps timestamptz (UTC). Tenant defaults prefill; nothing hardcoded to Brazil.

## Deletion rules

Hard delete allowed only for draft Experiences with no Offerings/Operations and draft Offerings with no Operations. Everything else is archived/cancelled. Operations are never hard-deleted.

## Migration & rollback

One additive versioned migration `0002_w02_experience_offering_operation.sql`: enums, three tables, indexes, GRANTs, RLS, policies, triggers, functions. Touches no W01 object. Rollback = a single down-migration dropping only W02 objects in reverse order; W01 is unaffected.

## Risks

1. Snapshot drift confusing users (renamed Experience vs operation name) — mitigated by showing lineage explicitly on the detail page.
2. operations_agent write scope may be too wide/narrow — tunable in one policy.
3. metadata jsonb as an escape hatch could become a shadow schema — governed by the extension-only rule.
4. Slug collisions on concurrent creates — unique index + retry in the command.

## Future compatibility

Tourism, events, hybrid, learning, gamification, commerce and marketplace all attach later by referencing experience/offering/operation ids. No vertical-specific columns, no points fields, no publication/public flags (marketplace becomes a separate projection).

## Explicit confirmations

OPERATION_STATUS_EVENTS_CREATED: NO  
PLANNED_EDITABLE_IN_DRAFT_PLANNING: YES  
PLANNED_FROZEN_FROM_READY: YES  
EXPECTED_USED_FOR_FORECAST_CHANGES: YES  
OPERATION_ARCHIVED_IS_STATUS: NO  
ARCHIVED_AT_ORTHOGONAL: YES  
COMPLETED_OUTCOME_PRESERVED_AFTER_ARCHIVE: YES  
CANCELLED_OUTCOME_PRESERVED_AFTER_ARCHIVE: YES  
METADATA_EXTENSION_ONLY: YES  
OFFERING_EXPERIENCE_CONSISTENCY_DB_ENFORCED: YES  
STANDALONE_OPERATION_SUPPORTED: YES  
W01 MODIFIED: NO  
W03+ TABLES PROPOSED: NO
