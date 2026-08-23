# COBS OS — V1 RELEASE CANDIDATE APPROVED

Date: 2026-08-23  
Scope: COBS OS V1 operational core / controlled QA-pilot envelope  
Decision: **RELEASE CANDIDATE APPROVED — PASS WITH NOTES**

This document is the formal V1 release-candidate record after the integrated QA cycle, dashboard implementation, lifecycle fixes, repository cleanup and final authentication hardening. It does not claim unrestricted general-availability readiness beyond the controlled pilot envelope.

## 1. Final release decision

**COBS OS V1 — RELEASE CANDIDATE APPROVED.**

No known **P0** or **P1** blocker remains in the validated V1 operational core.

Validated application release commit before this documentation-only update:

- Git branch: `main`
- Application release commit: `8f7c051b2fdca1db97867cbb425f32c1034a435b`
- Vercel project: `cobs-os-qa`
- Vercel target: production
- Official URL: `https://cobs-os-qa.vercel.app/app`
- Health: HTTP 200, `status=ok`, `app=up`, `auth=up`, `data_api=up`
- Runtime errors at final verification: none reported
- Open pull requests at final repository sweep: **0**

The documentation commit that records this approval is non-functional; production must still be smoke-checked after its deployment before the RC reference is frozen.

## 2. Integrated flows validated in QA

### Operation lifecycle

- Operation creation and planning surfaces exercised.
- Journey operational steps executed through normal UI actions.
- Operation completion validated through the normal `Concluir operação` interface.
- `ACTIVE -> COMPLETED` was proven on the same QA operation after legitimate domain preconditions were satisfied.
- `set_operation_status` remains the lifecycle authority; no integrity guard was removed or weakened.
- Known lifecycle blockers are humanized in the frontend instead of collapsing to the generic `Algo não funcionou` fallback.

### Journey / Live operation

- Step start and completion.
- Boarding start/completion.
- Departure authorization.
- Movement start.
- Arrival registration.
- Final step completion.
- Journey-complete state leading to formal operation closure.
- Backend terminal-state guards preserve history and reject invalid post-close writes.

### Mobility

- Vehicle and contextual driver assignment.
- Vehicle requested / en route / at pickup / departed / arrived sequence.
- Closed transport leg becomes read-only at the domain boundary.
- Dispatch sequence remains guarded by backend invariants.
- The historical driver-eligibility issue is closed as completed after the validated mobility PASS.

### Hospitality

- Stay creation and confirmation.
- Person added to stay.
- Room creation and assignment.
- Check-in opened and confirmed.
- Check-out confirmed.
- Group check-out completed.
- Stay completed and room released.
- Terminal stay becomes historical/read-only.

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
- Administrative counter updated from unread to read.

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

No simulated data is used. When a metric cannot be derived from real facts, the UI omits it or states that data is insufficient.

Result: **Dashboard Operacional V1 PASS in production QA**.

## 3. Authentication and authorization hardening

Final release hardening added strict same-origin post-auth redirect validation and regression coverage.

The V1 now rejects unsafe redirect forms including:

- protocol-relative external destinations;
- backslash-normalized external destinations;
- control-character redirect tricks;
- absolute destinations outside the current origin.

Administrative surfaces remain gated by an active operational membership. Authentication alone does not grant operator access. Traveler, invitation and onboarding flows remain explicitly separated from the administrative access gate.

Tenant selection is constrained to active memberships returned by the backend; a stale or altered local tenant identifier does not create authorization.

## 4. Commerce and payments

The W09 Commerce & Payments Core has prior adversarial verification of **101/101 assertions passed** for its frozen backend contract, including RLS, tenant isolation, capacity concurrency, append-only financial facts and idempotency.

Mercado Pago PIX creation currently requires authenticated user context, server-authorized payment-attempt creation, BRL contract checks, idempotency and provider response reconciliation before canonical provider facts are recorded.

Webhook notifications are authenticated by HMAC and are treated only as triggers; financial amount and status are reconciled from Mercado Pago before persistence.

A non-blocking V1.1 hardening item remains open to enforce a maximum age/skew for the signed webhook timestamp. This does not permit forged financial state because provider reconciliation and ledger idempotency remain authoritative.

## 5. Navigation / scope freeze

The V1 navigation no longer exposes dead planned placeholders that only routed back to `/app`.

Removed until they have real routes/workflows:

- `Rede W04`
- `Indicadores W05`

Operational intelligence remains consolidated in **Centro de comando** for V1.

## 6. Repository and release hygiene

- `.env` is not versioned.
- `.env` and `.env.*` are ignored, with `.env.example` explicitly allowed.
- `.env.example` contains placeholders only.
- Python cache artifacts are ignored and tracked cache files were removed.
- Stale draft PRs from superseded preview work were closed.
- Final repository sweep found **0 open PRs**.

## 7. Quality gates

Release hardening PRs passed the repository Quality Gate, including:

- build;
- formatting step;
- `tsc --noEmit`;
- ESLint;
- Bun tests.

The final authentication hardening release passed **Quality Gate #79** before merge.

## 8. Database safety snapshot

The connected QA Supabase safety census previously recorded:

- public tables: **68**;
- public tables with RLS enabled: **68/68**;
- disabled non-internal public triggers: **0**;
- no RLS relaxation, tenant-isolation bypass or manual data mutation introduced to make QA pass.

## 9. Accepted V1.1 backlog

The following remain non-blocking and must not reopen V1 scope unless new evidence upgrades severity:

- Issue #21 — consolidated P2/P3 release-gate UX/backlog findings;
- Issue #29 — make Ao Vivo explicitly historical/read-only on terminal operations;
- Issue #31 — enforce Mercado Pago webhook signature timestamp freshness;
- durable client-side error sink and stronger client/audit correlation;
- automated alert delivery;
- provider-owned auth recovery proof;
- automated backup/PITR and storage recovery evidence;
- second-admin / bus-factor hardening before broader scale;
- scaled external integrations and broader payment processing;
- richer analytics beyond the V1 command center.

## 10. Release classification

### P0

**0 known.**

### P1

**0 known in the validated V1 operational core.**

### P2 / P3

Tracked as V1.1/backlog and non-blocking for the controlled pilot envelope.

## 11. Final gate

# **COBS OS V1 — RELEASE CANDIDATE APPROVED**

**PASS WITH NOTES — GO for controlled QA/pilot envelope.**

The V1 operational core has demonstrated normal-interface execution across Journey, Mobility, Hospitality, Events, Communication, traveler access, operation closure, operational dashboard and release hardening while preserving RLS, tenant isolation, append-only history and domain lifecycle guards.

From this point forward, V1 is scope-frozen. New capabilities move to V1.1/backlog unless a newly reproduced **P0/P1** regression appears.
