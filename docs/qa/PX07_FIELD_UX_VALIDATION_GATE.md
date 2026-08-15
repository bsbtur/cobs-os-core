# PX07 — Field UX Validation Gate

Status: STATIC PREFLIGHT COMPLETE · HUMAN FIELD QA PENDING  
Scope: preview/alpha-productization-px01 only  
Purpose: validate the mobile Live workflow before adding more product surface.

## Safety contract

PX07 does not add domain behavior. Validate only through existing UI/RPC paths. Do not bypass RLS, migrations, lifecycle guards, readiness, presence retractions, BOARDING_STARTED, ARRIVED, or tenant isolation.

The batch path remains auditable by design: it calls `record_presence_fact` once per selected participation, sequentially. A partial failure must remain visible as partial success/failure; do not simulate atomic bulk behavior.

## Static preflight findings

### PX07-P2-001 — duplicated passenger blocker

Observed: Next Best Action already presents unresolved/unconfirmed travelers as the current blocker, while Attention Center could repeat the same passenger condition.

Resolution applied in preview: passenger readiness blockers remain owned by PX04/readiness. PX05 is focused on exceptional/cross-domain attention. No domain rule changed.

### PX07-P2-002 — green Attention Center consumes mobile space

Observed: when there is no exceptional attention, a positive green card adds vertical height before the canonical Live runtime.

Resolution applied in preview: the empty-success Attention Center remains visible on larger screens but is hidden on mobile. Exceptional attention remains visible.

### PX07-P2-003 — too many simultaneous attention rows

Observed: an operation with multiple W09 signals can create a tall block before the current-step runtime.

Resolution applied in preview: show the top 3 attention signals in severity order and summarize the remainder. Critical ordering is preserved.

### PX07-P2-004 — finance is not a field-runtime priority

Observed: outstanding balance is useful in the executive cockpit but competes with operational exceptions in Live.

Resolution applied in preview: financial balance remains in the executive Overview cockpit; it is no longer promoted in the Live Attention Center.

## Device baseline

Run at least once on a real phone, portrait orientation, normal browser zoom. Recommended second pass: narrow viewport / smaller phone. Desktop is regression-only.

## Evidence to capture

For each scenario record:

- PASS / WARN / FAIL
- taps required
- unexpected scrolls
- time to complete
- duplicated or competing controls
- unclear wording
- accidental-tap risk
- screenshot only when it explains a WARN/FAIL

## Golden Field Flow

### G1 — Open Live

1. Open an active operation.
2. Enter **Ao vivo**.
3. Confirm the operator can identify, without scrolling excessively:
   - current operational context;
   - Next Best Action;
   - Attention Center when relevant;
   - current-step action.

PASS: first required action is understandable in <= 5 seconds.

### G2 — Start / advance step

1. Use the canonical StepActions control.
2. Confirm the UI reacts after backend acceptance.
3. Confirm no duplicate primary action competes with the canonical action.

PASS: state transition is obvious and no manual refresh is required.

### G3 — Individual passenger flow

1. Use a step requiring presence/accounting.
2. Confirm pending travelers appear before resolved travelers on mobile.
3. Register the first traveler.
4. Confirm the resolved card loses priority.
5. Confirm the next pending traveler receives visual focus.
6. Repeat for at least three travelers.

PASS: operator can execute a tap → next → tap → next rhythm without searching the list.

### G4 — Boarding gate

1. Enter a boarding step before BOARDING_STARTED.
2. Confirm BOARDED cannot be recorded through individual or batch UI.
3. Start boarding using the canonical journey action.
4. Confirm BOARDED becomes available.

FAIL: any UI path records BOARDED before BOARDING_STARTED.

### G5 — Batch presence

1. Leave at least two travelers pending.
2. Confirm Batch Mode appears only on mobile Live.
3. Select a subset, not all.
4. Apply the contextual presence fact.
5. Confirm selected travelers are resolved individually.
6. Confirm non-selected travelers remain pending.
7. Confirm the batch result reports success/failure counts.

PASS: auditability remains one fact per participation and partial failure is visible.

### G6 — Arrival / disembarkation gate

1. Reach a disembarkation context before ARRIVED.
2. Confirm DISEMBARKED is unavailable/blocked.
3. Register ARRIVED through the canonical journey action.
4. Confirm disembarkation becomes available.

FAIL: any UI path records DISEMBARKED before ARRIVED.

### G7 — Checklist readiness

1. Use a step with a required playbook item pending.
2. Confirm Next Best Action/readiness indicates the blocker.
3. Complete the required item.
4. Confirm the blocker disappears without a manual reload.
5. Confirm step completion remains governed by canonical readiness.

### G8 — Attention Center

Create/use existing QA facts that produce attention signals. Verify critical signals sort before warning/info, current-step passenger blockers are not duplicated from PX04, and the center does not invent a state not present in W09 intelligence/runtime data.

### G9 — Completion and next step

1. Satisfy presence/checklist/gates.
2. Complete the current step.
3. Confirm current/next context changes.
4. Confirm guidance points to the next legitimate action.

### G10 — Regression / tenant safety

1. Switch to another authorized tenant/operation if QA data exists.
2. Confirm no passenger, step, presence, attention, or batch selection leaks across operations/tenants.
3. Return to the original operation and confirm state remains canonical.

FAIL: any cross-tenant or cross-operation leakage.

## UX scorecard

Target for Alpha Field UX:

| Metric | Target |
|---|---:|
| Understand first action | <= 5 s |
| Individual presence | 1 primary tap / traveler |
| Search for next pending traveler | 0 manual searches after each success |
| Accidental duplicate actions | 0 |
| Horizontal nav confusion | 0 blocking cases |
| Manual page refresh | 0 |
| Critical backend guard bypass | 0 |

## Simplification backlog rules

After the run, classify every issue:

- P0: safety, wrong fact, wrong tenant, lifecycle/readiness bypass.
- P1: operator can make a likely operational mistake.
- P2: unnecessary taps/scroll/duplication or confusing hierarchy.
- P3: polish only.

Do not add new modules during PX07. Prefer removing, merging, collapsing, reordering, or clarifying existing UI.

## Exit criteria

PX07 PASS requires:

- G1–G10 executed;
- zero P0;
- zero unresolved P1;
- BOARDING_STARTED and ARRIVED gates preserved;
- individual and batch presence remain auditable;
- no tenant leakage;
- no manual refresh required in the Golden Field Flow;
- P2/P3 backlog documented for the next simplification pass.
