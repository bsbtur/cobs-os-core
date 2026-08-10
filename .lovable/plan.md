# COBS OS — W02 ARCHITECTURE GATE

Experience · Offering · Operation core. No implementation until approved.

## Proposed tables (all tenant-owned)

**experiences** — reusable definition
id, tenant_id, name, slug, short_description, description?, experience_kind (tourism|event|hybrid), category_tags text[], metadata jsonb, status (draft|active|archived), default_locale, default_timezone, country_code?, region?, city?, created_by, created_at, updated_at.
No price. No operational state. Unique: (tenant_id, lower(slug)).

**offerings** — commercial configuration of one experience
id, tenant_id, experience_id (NOT NULL, cascade-restrict), name, slug, status (draft|active|paused|archived), available_from?, available_until?, sales_start?, sales_end?, capacity?, currency_code? (ISO 4217), metadata jsonb, created_by, timestamps.
Unique: (tenant_id, experience_id, lower(slug)). No pricing, no payment.

**operations** — one concrete execution (runtime aggregate)
id, tenant_id, experience_id?, offering_id?, name (own copy), code (tenant-unique), operation_kind (tourism|event|hybrid), status (draft|planning|ready|active|completed|cancelled|archived), primary_country, primary_region?, primary_city?, timezone (IANA), planned_start, planned_end, expected_start?, expected_end?, cancelled_at?, cancellation_reason?, completed_at?, archived_at?, source_experience_name?, source_offering_name?, metadata jsonb, created_by, timestamps.
No participants, journey, mobility, hospitality, commerce.

Optional 4th table (recommended, minimal): **operation_status_events** (append-only: operation_id, from_status, to_status, reason?, actor_profile_id, occurred_at) — lifecycle history without polluting audit_events. Say NO and I drop it; audit_events alone then carries transitions.

## Relationships & cardinalities

experience 1—N offering; experience 1—N operation (optional); offering 1—N operation (optional); tenant 1—N all three. offering.experience_id and operation.* references are tenant-consistent (composite FK on (tenant_id, id)) so cross-tenant linkage is structurally impossible.

Experience on Operation is **optional** — a standalone technical visit / internal event must be creatable without first authoring a catalog definition. Offering requires an Experience because an Offering has no meaning without the thing it presents. Rule enforced: if offering_id is set, experience_id must be set and must equal offering.experience_id.

## Source of truth / snapshot

Referenced (lineage, mutable upstream): experience_id, offering_id.
Owned by Operation (snapshotted at creation, never auto-synced): name, code, operation_kind, timezone, primary_country/region/city, planned dates, and denormalized source_experience_name / source_offering_name captured at creation.
Not copied: descriptions, tags, capacity, currency, media. Renaming an Experience never rewrites executed history.

## Lifecycle

Experience: draft → active → archived (archived → active allowed).
Offering: draft → active ⇄ paused → archived.
Operation: draft → planning → ready → active → completed; cancelled from any non-completed state; archived from completed/cancelled. **completed never returns to active** (trigger-enforced). Cancelled = business did not proceed; archived = visibility/storage state, independent of outcome.

## Temporal integrity

planned_* immutable after creation except by owner/admin with an audited reason. expected_* is the current forecast, may change, requires a reason, and is audited with previous/new/actor. No actual_* in W02 — actuals are future runtime facts.

## RLS matrix (uses W01 app_private helpers only; no parallel tenant logic)

| Action | experiences | offerings | operations |
|---|---|---|---|
| SELECT | is_tenant_member | is_tenant_member | is_tenant_member |
| INSERT | owner/admin | owner/admin | owner/admin/operations_agent |
| UPDATE | owner/admin | owner/admin | owner/admin/operations_agent |
| DELETE | owner/admin (draft, no children) | owner/admin (draft, no operations) | denied — lifecycle only |

member = read only. No contextual per-operation assignment (W03).

GRANTs per table: `SELECT, INSERT, UPDATE ON ... TO authenticated` (+ DELETE on experiences/offerings), `ALL TO service_role`. No anon grants anywhere.

## Idempotency, audit, functions

Idempotency reuses W01 `idempotency_keys`: client sends a key per create; replay returns the stored result. Applies to create_experience, create_offering, create_operation.

Public SECURITY DEFINER functions (search_path pinned, role-checked via app_private.has_tenant_role): `create_experience`, `create_offering`, `create_operation`, `set_operation_status`, `set_operation_expected_window`. Simple field edits go through RLS'd UPDATE, audited by trigger.

Audit via existing `app_private.record_audit_event`, metadata = ids + changed field names + old/new for lifecycle and expected-time only. No row dumps, no PII. Actions: experience.created/updated/archived, offering.created/updated/status_changed, operation.created/updated/status_changed/expected_time_changed/cancelled/completed.

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

One additive versioned migration `0002_w02_experience_offering_operation.sql`: enums, 3 (or 4) tables, indexes, GRANTs, RLS, policies, triggers, functions. Touches no W01 object. Rollback = a single down-migration dropping only W02 objects in reverse order; W01 is unaffected because nothing references it except read-only FKs to tenants/profiles.

## Risks

1. Snapshot drift confusing users (renamed Experience vs operation name) — mitigated by showing lineage explicitly on the detail page.
2. operations_agent write scope may be too wide/narrow — tunable in one policy.
3. metadata jsonb as an escape hatch could become a shadow schema — restricted to categorization/tags in W02.
4. Slug collisions on concurrent creates — unique index + retry in the command.

## Future compatibility

Tourism, events, hybrid, learning, gamification, commerce and marketplace all attach later by referencing experience/offering/operation ids. No vertical-specific columns, no points fields, no publication/public flags (marketplace becomes a separate projection).

## Explicit answers

EXPERIENCE SEPARATE FROM OFFERING: YES
EXPERIENCE SEPARATE FROM OPERATION: YES
OFFERING SEPARATE FROM OPERATION: YES
OPERATION CAN EXIST WITHOUT OFFERING: YES
OPERATION HISTORICAL IDENTITY PRESERVED: YES
PLANNED EXPECTED ACTUAL MODEL PRESERVED: YES
TENANT RLS REQUIRED: YES
W01 MODIFIED: NO
W03+ TABLES PROPOSED: NO
