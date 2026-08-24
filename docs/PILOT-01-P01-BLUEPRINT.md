# COBS OS — PILOT-01

## P0.1 — PILOT SCENARIO BLUEPRINT

### City Tour Brasília Executivo — COBS Pilot-01

STATUS: DESIGN ONLY — DRAFT FOR APPROVAL
Nothing created. No Operation, no people, no participations, no invitations, no orders, no schema change.
W11: CLOSED. Production architecture: UNCHANGED.

---

## A — PILOT IDENTITY

| Item                   | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| Name                   | City Tour Brasília Executivo — COBS Pilot-01                         |
| Tenant                 | BSBTUR (real production tenant)                                      |
| Duration               | 1 day (~6h operational window)                                       |
| Target travelers       | 10 (ideal band 8–12, absolute max 15)                                |
| Operator               | Rafael (owner). Optional: ≤1 operations_agent                        |
| Vehicle                | 1                                                                    |
| Transport legs         | 2 (outbound + return)                                                |
| Hospitality (W06)      | NO                                                                   |
| Event production (W07) | NO                                                                   |
| Commerce (W09)         | NO — Option A, no real financial records                             |
| Portal /my (W10)       | YES — mandatory                                                      |
| Communication (W08)    | In-app only                                                          |
| External integrations  | NONE (WhatsApp is human fallback only, never a technical dependency) |
| Manual backup          | MANDATORY (pre-migration, T-1, day-close)                            |
| Manual fallback pack   | MANDATORY (printed roster + itinerary + phone list)                  |

Envelope compliance: within every M6 safe-pilot limit.

---

## B — DOMAINS IN SCOPE

IN: W01 identity/tenant · W02 operation · W03 people/participations/roles · W04 journey/presence/runtime · W05 mobility (vehicle, legs, optional seats) · W08 communication · W10 participant access & portal.

OUT: W06 hospitality · W07 events · W09 commerce · Storage/file uploads · any external API.

---

## C — DEFINITIVE ITINERARY (5 journey steps)

Timezone: America/Sao_Paulo. All timestamps stored UTC.

| #   | Step                                    | PLANNED start | PLANNED end | Purpose in test                                        |
| --- | --------------------------------------- | ------------- | ----------- | ------------------------------------------------------ |
| 1   | Encontro e embarque (ponto de encontro) | 08:00         | 08:30       | Presence capture, boarding, first live execution       |
| 2   | Praça dos Três Poderes / Esplanada      | 08:30         | 10:00       | Standard step start/complete                           |
| 3   | Catedral e região central               | 10:00         | 11:00       | Step with deliberate EXPECTED-time shift (delay drill) |
| 4   | Memorial JK / Eixo Monumental           | 11:00         | 12:30       | Post-delay cascade visible in Portal                   |
| 5   | Parada / almoço                         | 12:30         | 14:00       | Long dwell step, in-app notice                         |
| 6   | Encerramento e retorno                  | 14:00         | 14:30       | Terminal transitions, return leg, close-out            |

PLANNED is frozen after preflight. Only EXPECTED moves during the day. ACTUAL is derived from recorded facts.

Transport legs:

- LEG-1 OUTBOUND — pickup 08:00 → Esplanada, vehicle V1, driver D1.
- LEG-2 RETURN — 14:00 → ponto de encontro original, same vehicle/driver.
- Seats: OPTIONAL. If enabled, 10 seats assigned; each traveler must see only their own.

---

## D — PEOPLE MODEL

| Role                             | Count | Notes                                           |
| -------------------------------- | ----- | ----------------------------------------------- |
| Owner (membership)               | 1     | Rafael — full admin surface                     |
| Operations agent (membership)    | 0–1   | Optional second operator                        |
| Driver (W05, linked to a Person) | 1     | Operational role only — NO login                |
| Guide (W03 operational role)     | 0–1   | Operational role only — NO login                |
| Travelers (participations)       | 10    | Portal access only, operation-scoped, revocable |

Binding rules: operational assignment never grants login; travelers are never members; Person ≠ Login ≠ Role.

Real-data constitution: travelers are real BSBTUR customers with informed consent to participate in a pilot experience. Minimum PII: full name + one contact channel. No documents, no payment data, no health data. Data is production data — never a fixture, never subject to cleanup/TRUNCATE.

---

## E — MESSAGES TO BE SENT (W08, in-app only)

| #   | When          | Trigger            | Audience      | Content intent                       |
| --- | ------------- | ------------------ | ------------- | ------------------------------------ |
| M-1 | T-3 days      | Access granted     | All travelers | Welcome + how to open the Portal     |
| M-2 | T-1 day 18:00 | Preflight complete | All travelers | Meeting point, time, what to bring   |
| M-3 | T0 07:00      | Day start          | All travelers | Reminder: boarding 08:00             |
| M-4 | T0 during     | Delay drill        | All travelers | Schedule updated — new expected time |
| M-5 | T0 12:30      | Lunch step         | All travelers | Break duration and reboarding time   |
| M-6 | T0 14:30      | Close-out          | All travelers | Thank you + feedback questions       |

All published messages are immutable. No message body ever appears in observability signals.

---

## F — TEST MATRIX (17 measurable assertions)

| ID   | Assertion                                                | Domain       | Evidence                                  |
| ---- | -------------------------------------------------------- | ------------ | ----------------------------------------- |
| T-01 | 10 travelers receive operation-scoped access             | W10          | Access records = 10                       |
| T-02 | 100% of travelers successfully open /my                  | W10          | Portal open confirmations                 |
| T-03 | Traveler A cannot see traveler B's private data          | W10          | Cross-account probe                       |
| T-04 | Itinerary renders correctly in Portal                    | W10/W04      | Screenshot vs blueprint                   |
| T-05 | A step is started (live)                                 | W04          | Step state = in_progress                  |
| T-06 | A step is completed                                      | W04          | Step state = completed                    |
| T-07 | An EXPECTED time is deliberately changed (delay drill)   | W04          | Forecast mutation recorded                |
| T-08 | Portal shows updated EXPECTED; PLANNED unchanged         | W04/W10      | Before/after comparison                   |
| T-09 | Travelers receive an in-app notice                       | W08          | Delivery records                          |
| T-10 | A presence fact is recorded                              | W04          | Presence event                            |
| T-11 | A controlled presence retraction succeeds (M3.1 path)    | W04/M3.1     | retract_presence_fact + append-only trail |
| T-12 | Transport legs progress through their states             | W05          | Leg state history                         |
| T-13 | If seats enabled, each traveler sees only their own seat | W05/W10      | Cross-account probe                       |
| T-14 | No traveler reaches any administrative surface           | W10/RLS      | Probe of admin routes/RPCs                |
| T-15 | Zero direct DML used during the pilot                    | Constitution | Command log review                        |
| T-16 | Operation reaches the correct terminal state             | W02          | Final state                               |
| T-17 | Digital history reconciles with physical reality         | All          | Reconciliation table                      |

Pass threshold: T-03, T-13, T-14, T-15 are BLOCKING (any failure = pilot failure). All others are measured and reported.

---

## G — FIVE MOMENTS (execution architecture)

### 1. T-7 / T-3 — SETUP

Create operation (W02) → people + participations + operational roles (W03) → journey steps (W04) → vehicle, driver, legs, optional seats (W05) → traveler access + M-1 (W10/W08).
Backup before and after any migration. No migrations expected.

### 2. T-1 — PREFLIGHT

Full read-back of every record against this blueprint · PLANNED frozen · every traveler access verified · fallback pack printed · backup executed · `/api/public/health` green · `[COBS_OBS]` console clean · M-2 sent.

### 3. T0 MORNING — BOARDING

Health check → step 1 started → presence recorded per traveler → LEG-1 departure → M-3 already delivered.

### 4. T0 DURING — LIVE OPERATION

Steps started/completed in order · delay drill on step 3 (EXPECTED only) · M-4 and M-5 sent · presence retraction drill if safe · hourly health + observability check · Portal spot-checks from a traveler device.

### 5. T+0 / T+1 — RECONCILIATION

Close all steps and legs · operation to terminal state · M-6 sent · day-close backup · reconciliation table (physical vs COBS) · Observation Log consolidated · Postmortem.

---

## H — PHYSICAL MOMENT → COBS ACTION → EXPECTED RESULT

| Physical moment                   | COBS action (approved command surface)                | Expected result                                                  |
| --------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Traveler arrives at meeting point | Record presence                                       | Presence fact appended; headcount rises                          |
| Group boards the vehicle          | Start LEG-1 / mark departure                          | Leg in transit; ACTUAL departure derived                         |
| Vehicle departs                   | Start step 1 → complete step 1                        | Step 1 completed; step 2 next                                    |
| Arrival at Esplanada              | Start step 2                                          | Step 2 in progress; Portal shows current activity                |
| Traffic delay before Catedral     | Update EXPECTED time of step 3                        | EXPECTED shifts, PLANNED frozen; Portal updates                  |
| Delay confirmed to group          | Publish M-4                                           | Immutable message delivered in-app                               |
| Wrong presence recorded           | Retract presence fact (M3.1)                          | Original fact retained, retraction appended, headcount corrected |
| Lunch break                       | Start step 5 + publish M-5                            | Step running; reboarding time visible                            |
| Reboarding for return             | Start LEG-2                                           | Return leg in transit                                            |
| Tour ends                         | Complete step 6 · close legs · close operation        | Operation terminal state; no open runtime objects                |
| Any COBS failure                  | STOP using COBS for that action, use fallback, log it | Physical operation unaffected; defect recorded for post-pilot    |

---

## I — OPERATOR PROCEDURES (Rafael)

1. One operator holds the COBS device; the guide never operates the system while managing the group.
2. Record facts as they happen — never batch-backfill more than 15 minutes late.
3. Never change PLANNED during the day.
4. Never use direct DML, never impersonate service_role, never run cleanup.
5. **Freeze rule: do not modify COBS during the tour to fix a product problem.** Non-safety bugs → fallback + Observation Log + fix after the pilot.
6. Escalation: safety issue → abandon COBS immediately, run the tour on the fallback pack.

---

## J — MANUAL FALLBACK PACK (mandatory, printed)

Roster with names and contacts · itinerary with planned times · vehicle and driver details · seat map if used · emergency numbers · blank Observation Log sheet. WhatsApp/phone remains the human communication fallback, outside COBS.

---

## K — CONTROLS MAPPED FROM M6

All 9 accepted P2 controls apply unchanged: manual monitoring at pre-flight/hourly/milestones/day-close; manual backup before-after-close; no automated alerting assumed; `auth.*` recovery provider-owned; legacy `authenticated` write grants gated by RLS and never exercised directly.

---

## L — TRAVELER FEEDBACK (post-tour, non-technical)

1. As informações da viagem estavam fáceis de encontrar?
2. Você sabia qual era a próxima atividade?
3. Os horários estavam claros?
4. O aplicativo ajudou durante o passeio?

Framing: a BSBTUR pilot experience — not a technical demo of COBS.

---

## M — PILOT PROGRESSION (post-Pilot-01)

Pilot-02 one-day excursion 15–30 · Pilot-03 with hospitality 20–30 · Pilot-04 smaller academic congress · Pilot-05 complex operation · CIOSP 2027 only after that progression.

---

## N — OPEN INPUTS REQUIRED BEFORE P1

1. Concrete date for T0.
2. Confirmed traveler list (10) with consent.
3. Vehicle and driver identification.
4. Meeting point address.
5. Seats: ENABLED or DISABLED.
6. Second operator: YES or NO.
7. Guide as a distinct Person: YES or NO.

---

## O — BLUEPRINT STATUS

```
BLUEPRINT_DEFINED:            YES
ITINERARY_STEPS:              6
TEST_ASSERTIONS:              17
BLOCKING_ASSERTIONS:          4
MESSAGES_PLANNED:             6
DOMAINS_IN_SCOPE:             7 (W01,W02,W03,W04,W05,W08,W10)
DOMAINS_EXCLUDED:             W06, W07, W09, integrations, storage
ENVELOPE_COMPLIANT:           YES
FREEZE_RULE_DEFINED:          YES
FALLBACK_DEFINED:             YES
REAL_DATA_CONSTITUTION:       ENFORCED
W11_STARTED:                  NO
REAL_OPERATION_CREATED:       NO
DECISION:                     AWAITING_BLUEPRINT_APPROVAL
```

STOP.

## Incident log

- **DEF-PILOT-004** — W08/W10 in-app eligibility (Gate 7): CLOSED 2026-08-11. See `docs/PILOT-01-DEF-PILOT-004.md`.
