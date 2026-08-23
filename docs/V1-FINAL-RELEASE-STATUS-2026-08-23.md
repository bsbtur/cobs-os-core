# COBS OS — V1 FINAL RELEASE STATUS

Date: 2026-08-23  
Scope: COBS OS V1 operational core / QA controlled pilot  
Decision: **PASS WITH NOTES — GO for controlled QA/pilot envelope**

This document records the final release-gate evidence gathered after the integrated QA cycle. It does not claim general-availability readiness beyond the controlled pilot envelope.

## 1. Release decision

No known **P0** or **P1** blocker remains in the validated V1 operational core.

Validated production-QA deployment:

- Git branch: `main`
- Release commit: `ee11c5a750445555300920df8d25e191bdde7eca`
- Vercel target: production for project `cobs-os-qa`
- Official URL: `https://cobs-os-qa.vercel.app/app`
- Health endpoint: HTTP 200, `status=ok`, `app=up`, `auth=up`, `data_api=up`
- Vercel runtime errors in the last 24 h at the final gate: none reported

## 2. Integrated flows validated in QA

### Operation lifecycle

- Operation creation and planning surfaces exercised.
- Journey operational steps executed through normal UI actions.
- Operation completion validated through the normal `Concluir operação` interface.
- `ACTIVE -> COMPLETED` was proven on the same QA operation after legitimate domain preconditions were satisfied.
- `set_operation_status` remains the lifecycle authority; no integrity guard was removed or weakened.
- Known lifecycle blockers are now humanized in the frontend instead of collapsing to the generic `Algo não funcionou` fallback.

### Journey / Live operation

- Step start and completion.
- Boarding start/completion.
- Departure authorization.
- Movement start.
- Arrival registration.
- Final step completion.
- Journey-complete state leading to formal operation closure.

### Mobility

- Vehicle and driver assignment.
- Vehicle requested / en route / at pickup / departed / arrived sequence.
- Closed transport leg becomes read-only.
- Dispatch sequence remains guarded by backend invariants.

### Hospitality

- Stay creation and confirmation.
- Person added to stay.
- Room creation and assignment.
- Check-in opened and confirmed.
- Check-out confirmed.
- Group check-out completed.
- Stay completed and room released.
- Terminal stay becomes read-only.

### Event production

- Draft -> planning -> program locked -> ready.
- Event start.
- Session start and completion.
- Event completion only after pending sessions were explicitly resolved.
- Closed event becomes historical/read-only.

### Communication + traveler portal

- Draft message created.
- Audience resolved from the operation roster.
- Participant invitation/claim flow completed for the correct operation.
- Effective participant access grant created.
- Message published.
- Recipient snapshot frozen at publication.
- In-app delivery created.
- Message displayed in traveler portal.
- Read receipt recorded.
- Administrative counter updated from `Leram 0` to `Leram 1`.

Result: **Communication E2E PASS**.

### Dashboard / Centro de comando

The former structural-only overview was replaced by a real operational dashboard using tenant-scoped data already present in the system.

Validated metrics include:

- operations by state;
- operations in execution / upcoming / recent;
- people involved;
- deterministic operational attention flags;
- mobility totals and arrival/departure evidence;
- hospitality totals and terminal state;
- event/session completion;
- communication publication, delivery, reading and read rate;
- recent operational facts;
- punctuality classification with separate early/on-time/late semantics.

No simulated data is used. When a metric cannot be derived from real facts, the UI must omit it or state that data is insufficient.

Result: **Dashboard Operacional V1 PASS in production QA**.

## 3. Navigation / scope freeze

The V1 navigation no longer exposes dead planned placeholders that only routed back to `/app`.

Removed from the V1 menu until they have a real workflow and route:

- `Rede W04`
- `Indicadores W05`

The operational intelligence already implemented remains in **Centro de comando**. Future detailed analytics may reintroduce a dedicated Insights route without duplicating the command center.

## 4. Repository / release hygiene

- `.env` is no longer versioned.
- `.env` and `.env.*` are ignored, with `.env.example` explicitly allowed.
- `.env.example` contains placeholders only.
- Real environment values are expected from the deployment environment.
- Removing the versioned `.env` was proven safe by both a Vercel preview and the full Quality Gate.

The publishable Supabase client configuration previously present in Git was not a service-role secret, but keeping environment-specific values out of version control is now the enforced release policy.

## 5. Quality gates

Recent release PRs passed the repository Quality Gate, including:

- build;
- formatting step;
- `tsc --noEmit`;
- ESLint;
- Bun tests.

The lifecycle-guidance release (`ee11c5a...`) was produced only after the corresponding preview and Quality Gate passed.

## 6. Database safety snapshot

Read-only final QA census on the connected QA Supabase project:

- public tables: **68**;
- public tables with RLS enabled: **68/68**;
- disabled non-internal public triggers: **0**;
- operations: **8 total / 8 completed / 0 active / 0 cancelled** at the snapshot;
- open hospitality stays: **0**;
- events not closed out: **0**;
- draft messages: **2**.

Draft messages are not lifecycle blockers by the implemented operation-close contract and remain valid draft state.

No RLS relaxation, tenant-isolation bypass or manual data mutation was introduced to make QA pass.

## 7. Accepted V1 limitations / V1.1 backlog

The following are **not P0/P1 blockers for the controlled pilot envelope**, but must not be represented as fully solved:

- durable client-side error sink is not yet the primary observability path;
- deterministic client-to-audit correlation ID remains a future observability improvement;
- automated alert delivery remains future work;
- scheduled backup execution / provider PITR proof remain operational controls rather than fully automated evidence;
- provider-owned `auth.*` recovery is not claimed as verified;
- storage backup/recovery is outside the validated pilot envelope;
- second-admin / bus-factor hardening remains recommended before scaling;
- scaled external integrations and scaled commerce/payment processing are outside this final operational-core gate;
- richer dedicated analytics may return later as a real route, but no dead Insights placeholder remains in V1.

## 8. Release classification

### P0

None known.

### P1

None known in the validated V1 operational core.

### P2

Accepted operational/observability/recovery limitations listed above. They do not require reopening stable V1 domains for this controlled release.

### P3

Cosmetic refinements, richer charts, additional analytics, broader automation and non-essential polish belong to backlog and must not block closure of V1.

## 9. Final gate

**PASS WITH NOTES — GO for controlled QA/pilot envelope.**

The V1 operational core has demonstrated normal-interface execution across Journey, Mobility, Hospitality, Events, Communication, traveler access, operation closure and operational dashboard consolidation while preserving RLS, tenant isolation, append-only history and domain lifecycle guards.

Do not reopen V1 scope for optional enhancements. New capabilities move to V1.1/backlog unless a newly reproduced P0/P1 regression appears.
