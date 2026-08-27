# V3.1-B6.1 — Product Navigation Contract

Date: 2026-08-26
Branch: `feat/v3.1-b6-product-integration`
Base: frozen B5 runtime integration
Main/CLEAN BUILD: untouched

## Objective

Define exactly where Operational Excellence belongs in the real COBS operation workspace before implementing production UI or read-model changes.

## Current operation workspace

The authenticated operation shell is `/_authenticated/operations/$operationId` and renders product navigation under `/operations/:operationId`.

Current workspace tabs, in order:

1. Overview — `/operations/:operationId`
2. People — `/operations/:operationId/people`
3. Journey — `/operations/:operationId/journey`
4. Live — `/operations/:operationId/live`
5. Mobility — `/operations/:operationId/mobility`
6. Hospitality — `/operations/:operationId/hospitality`
7. Events — `/operations/:operationId/events`
8. Communication — `/operations/:operationId/communication`

The shell is wrapped by `RequireTenant`. It loads operation `status, timezone` from the canonical `operations` row and uses `isOperationTerminal(status)` to switch terminal records to read-only behavior.

For terminal operations:

- Overview remains the normal detail page.
- Live has a dedicated terminal historical record.
- Other operational tabs are preserved for historical consultation inside a disabled fieldset.
- The terminal banner explicitly says the record is historical and read-only.

This is the correct product philosophy for Excellence as well: completed operations become historical records; Excellence is a read-only analysis of that history, never an operational mutation surface.

## Current Overview responsibilities

`operations.$operationId.index.tsx` owns the operation Overview and contains:

- core operation detail/lifecycle
- planned baseline/current forecast
- lifecycle actions
- terminal completion/cancel/archive actions

Lifecycle authorization in the UI is derived from `useTenant()`:

- `canManage` (owner/admin) can complete
- `operations_agent` can perform non-owner operational lifecycle actions where allowed
- database RPC remains authoritative

The final lifecycle mutation calls `set_operation_status`; B5 already integrated final Operational Excellence evaluation into this server-side completion boundary.

## Product placement decision

### 1. Overview summary card — YES

For `operation.status = completed` and a final canonical Operational Excellence snapshot exists, Overview should display a compact read-only summary card after the primary operation identity/window information and before/near lifecycle history:

- medal/classification (`Operação Ouro`, etc.)
- rounded score (`94%`)
- one-sentence explanation
- CTA: `Ver Excelência Operacional`

The card must not expose raw snapshot UUID, model internals, QA wording or edit controls.

For completed operations with `insufficient_evidence`, the card should show `Sem classificação — evidências insuficientes`, not 0%.

For active/planning/ready/draft operations, no final medal/score is shown. Product copy may say `Disponível após a conclusão` only if we later decide it improves discovery; this is not required for B6.3.

For cancelled operations, do not present a normal Gold/Silver/Bronze completion result.

### 2. Dedicated product route/tab — YES

Create an authenticated read-only route:

`/operations/:operationId/excellence`

Product label:

`Excelência Operacional`

This route reuses the frozen B4/B5 visual language but removes all QA-specific diagnostics.

It must read by `operation_id` through the production read model, which resolves the authorized final snapshot server-side. The browser must not choose an arbitrary snapshot UUID as it did in QA.

### 3. Workspace navigation visibility

Add `Excelência` to the operation workspace navigation.

Recommended behavior:

- completed + final snapshot: enabled
- completed + insufficient evidence: enabled, showing the evidence-insufficient experience
- non-completed: either hidden or disabled; initial B6 implementation should prefer hidden to avoid an empty product surface
- cancelled: hidden unless a future cancellation-quality model is explicitly designed

Do not overload the existing Live tab. Live remains the chronological operational record; Excellence is analytical interpretation of the completed operation.

## Read-only contract

The Excellence route is conceptually terminal/history content and must never be wrapped in a mutation-enabled workflow.

The route may query only a production read model that returns:

- operation identity/status
- final snapshot summary
- score/classification/coverage
- dimension scores
- persisted evidence
- model version only if needed for audit details

It must not expose mutation RPCs or client-side score calculation.

## Authorization contract

1. Authentication remains enforced by the `_authenticated` route tree.
2. Tenant membership remains enforced by `RequireTenant` at product shell level.
3. Database/RLS/read-RPC remains authoritative and must verify tenant access independently of UI.
4. No cross-tenant snapshot lookup by arbitrary UUID.
5. Score/evidence remains read-only to product users.

B6.2 must implement/validate this production read boundary before B6.3 adds the UI.

## UX contract

Reuse the frozen B4 presentation primitives:

- classification hero
- score
- obtained/possible/lost
- five dimensions
- evidence explanations
- `Por que recebi esta nota?`

Remove from product UX:

- `QA Mobile`
- `Runtime E2E`
- environment notices
- raw snapshot UUID
- raw `operational_excellence_v1` unless placed behind an audit/details affordance

Desktop must be allowed to evolve responsively in B6.3 without changing the semantic content or scoring rules.

## Explicit non-goals

B6 does not include:

- score formula changes
- score editing
- manual override
- ranking/benchmarking
- team/vendor scores
- paywall
- Living Language V3.2
- Audio Guide V3.3
- COBS Club
- AI Companion

## Gate decision

**B6.1 — PASS.**

Approved product topology:

`Operations -> Operation Overview -> Excellence summary -> /operations/:operationId/excellence`

with the dedicated Excellence route also represented as a contextual workspace tab only when a completed operation has an available terminal evaluation.

Next gate: **B6.2 — Production Read Model & Authorization**.
