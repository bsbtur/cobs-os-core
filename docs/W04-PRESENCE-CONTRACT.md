# W04 — Canonical presence contract (POST_PILOT_RELEASE_02)

Functional-only change. No table, column, enum, RLS or data was touched.

## Canonical matrix (backend default + allowed overrides)

| step_kind | default | allowed |
|---|---|---|
| meeting | accounted | accounted |
| boarding | boarded | boarded |
| movement | none | none |
| return | none | none |
| arrival | none | none, accounted |
| activity | none | none, accounted |
| meal, hotel, event, break, free_time, other | none | none |
| disembarkation | accounted | accounted |

`boarded` is legal only on `boarding`. Population default stays `participants`;
`all_confirmed` is preserved and only rejected when the step has no presence
requirement (`none`). Broader governance of `all_confirmed` is deferred.

## Backend

- `app_private.w04_default_presence_requirement(journey_step_kind)` — updated.
- `app_private.w04_assert_presence_contract(journey_step_kind, step_presence_requirement, step_presence_population)` — new.
- Applied in `public.create_journey_step`, `public.create_ad_hoc_journey_step`,
  `public.update_journey_step` (validated on the effective final state, before write).

No backfill, no retroactive validation. The 14 historical steps are untouched.

## Known historical divergence

Golden Pilot `CITYTO-20260815` seq 60 is `return / boarded`, which the contract no
longer allows. The row is preserved as-is; any future call to `update_journey_step`
that touches presence fields on that row will be rejected by the contract. This is
intentional — no silent exception was created. The journey plan UI flags such rows
with a "historical configuration" chip and never repairs them automatically.

## Frontend

- `src/lib/w04.ts` — `PRESENCE_CONTRACT`, `defaultPresenceRequirement`,
  `allowedPresenceRequirements`, `isCanonicalPresence` (single source of truth).
- `StepDialog` shows only allowed requirements, recomputes the default on kind
  change, and omits `_presence_requirement` when it equals the canonical default
  so the backend stays the authority; explicit value is sent only for the
  legitimate overrides (`arrival/accounted`, `activity/accounted`).
- Live screen audited: no change required (panels already keyed off
  `presence_requirement`, ARRIVED gating for movement/return/disembarkation intact).
