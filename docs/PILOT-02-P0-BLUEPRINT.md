# PILOT-02 — P0 MULTI-PASSENGER BLUEPRINT (DESIGN ONLY)

Status: DESIGN ONLY — no Operation, Person, Participation, Vehicle, Seat, Invitation,
Grant, Message or runtime fact has been created. Golden Pilot `CITYTO-20260815` untouched.
Basis: GATE-PILOT-02 re-audit = READY_WITH_CONTROLS (controls C1–C6 binding).

## 1. Operation envelope

| Field                                                  | Value                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| Tenant                                                 | BSBTUR (production)                                        |
| Experience / Offering                                  | reuse an existing active tourism offering (no new catalog) |
| Operation kind                                         | single-day city tour, round trip                           |
| Travelers                                              | 5 (individual participations)                              |
| Crew                                                   | 1 driver + 1 operations_agent                              |
| Authority                                              | Rafael (Owner), on call for the whole window               |
| Vehicle                                                | 1, effective capacity KNOWN and >= 5                       |
| Transport legs                                         | 2 (outbound, return)                                       |
| Seats                                                  | 5 labeled: A01–A05                                         |
| Hospitality / Event / Commerce / External integrations | OFF                                                        |
| Lifecycle                                              | draft -> planning -> ready (T0-1d) -> active -> completed  |

Out of scope by design: stays, rooming, venues, sessions, orders, payments, webhooks,
ad-hoc legs beyond fallback, second vehicle, unnumbered seats.

## 2. Roster roles

| #   | Person         | Participation kind | Status pre-T0 | Portal                 | Tenant membership                    |
| --- | -------------- | ------------------ | ------------- | ---------------------- | ------------------------------------ |
| 1–5 | Travelers      | `participant`      | `confirmed`   | grant + claim required | none                                 |
| 6   | Driver         | `crew`             | `confirmed`   | not required           | none (W05 driver record refs Person) |
| 7   | Field operator | `crew`             | `confirmed`   | not required           | `operations_agent`                   |
| 8   | Rafael         | not on roster      | —             | —                      | `owner`                              |

Operational role assignments (W03) are contextual only and never grant login.

## 3. Vehicle capacity requirement (C1)

- `vehicles.capacity` MUST be set, or `transport_legs.capacity_override` MUST be set on both legs.
- Rationale: `assign_seat` enforces `active_assignments + 1 <= coalesce(capacity_override, vehicle.capacity)`
  under a per-leg advisory transaction lock. With NULL capacity the path is LEGACY_PASSTHROUGH — no enforcement.
- Verification before any seating: read the leg detail and confirm a numeric effective capacity is displayed.
- Recommended: capacity exactly the real vehicle seat count (>= 5), not inflated.

## 4. Seat map

Both legs use the same labels: `A01 A02 A03 A04 A05`, one traveler per label,
same traveler keeps the same label outbound and return (stable manifest).
No blank/unnumbered seats: the DEF-PILOT-013 confirmation dialog must never be triggered.
Crew (driver, operator) are NOT seat-assigned — capacity counts travelers only.

## 5. Journey structure (W04)

| Seq | Step                         | Kind             | Presence population | Presence requirement |
| --- | ---------------------------- | ---------------- | ------------------- | -------------------- |
| 1   | Encontro / check-in do grupo | `meeting`        | participants        | `accounted`          |
| 2   | Embarque (ida)               | `boarding`       | participants        | `boarded`            |
| 3   | Deslocamento (ida)           | `movement`       | participants        | `none`               |
| 4   | Chegada / roteiro            | `arrival`        | participants        | `none`               |
| 5   | Atividade guiada             | `activity`       | participants        | `accounted`          |
| 6   | Embarque (retorno)           | `boarding`       | participants        | `boarded`            |
| 7   | Retorno                      | `return`         | participants        | `none`               |
| 8   | Desembarque final            | `disembarkation` | participants        | `none`               |

Rules: `BOARDED` is only accepted after `BOARDING_STARTED` on that step; departure
authorization is required before `DEPARTED`; `DISEMBARKED` only after `ARRIVED`.

## 6. Leg structure (W05)

| Leg | Kind       | Vehicle | Driver | Seats   | Bound step |
| --- | ---------- | ------- | ------ | ------- | ---------- |
| L1  | `outbound` | V1      | D1     | A01–A05 | step 2     |
| L2  | `return`   | V1      | D1     | A01–A05 | step 6     |

Dispatch path per leg: `planned -> assigned -> en_route_to_pickup -> at_pickup -> in_transit -> arrived`.
Seat assignments are per leg; releasing on L1 does not affect L2.

## 7. Pre-T0 confirmation checklist (C3)

Run at T0-24h and re-run at T0-2h:

1. Operation status = `ready`.
2. 5 traveler participations exist, all `status = confirmed` (zero `expected`).
3. Driver and operator participations `confirmed`.
4. Vehicle effective capacity is a known number >= 5 (C1).
5. Both legs exist with vehicle + driver assigned.
6. 5 active seat assignments on L1 and 5 on L2, labels A01–A05, no duplicates, no blanks.
7. Live page shows zero "não contabilizado" warning badges on step 1.
8. Rafael (Owner) confirmed reachable for the full window (C2).
9. Journey steps 1–8 present, in sequence, with the presence requirements above.
10. Manual fallback sheet printed (section 12).

Any unchecked item at T0-2h = do not start; escalate to Rafael.

## 8. Portal claim checklist (C4)

1. Grant participant access for each of the 5 travelers (operation-scoped, revocable).
2. Send the claim link through the existing external channel (WhatsApp/e-mail) — outside COBS.
3. Traveler signs up / signs in and claims; grant becomes bound to a profile.
4. Verify claim: the traveler's grant is `active` AND their Person is linked to a profile.
   Only then is that traveler counted as in-app reachable.
5. Record `reachable N/5` on the fallback sheet before T0.
6. If N < 5: in-app messaging is a convenience only; every operational instruction must
   also go out on the external channel until N = 5.

## 9. Seat <-> boarded reconciliation procedure (C5)

Before authorizing departure on each leg:

1. Open the leg seat manifest — list active assignments (expected: 5).
2. Open the live step presence panel — list travelers with a `BOARDED` fact.
3. Compare name by name.
4. Match (5 = 5, same people) -> request departure authorization from Rafael.
5. Mismatch -> do NOT depart:
   - seated but not boarded -> locate person, or run the absence procedure;
   - boarded but not seated -> assign the seat before departure (single operator, C6);
   - count mismatch -> recount physically, then reconcile in system.
6. Write the reconciliation result (time, 5/5 or exception) on the fallback sheet.

## 10. Absence / no-show procedure

1. Traveler missing at the meeting point: operator records `ABSENCE_NOTED` with a reason (reason mandatory).
2. Wait window: 10 minutes past the expected step time, then call the traveler.
3. Still absent: operator calls Rafael. Only Rafael (owner/admin) can record `NO_SHOW_CONFIRMED`,
   with a mandatory reason.
4. After a confirmed no-show, the operator releases that traveler's seat on both L1 and L2
   (release reason recorded), keeping the manifest truthful.
5. Roster status is deliberately not rewritten — presence facts are the record.
6. Late arrival after `ABSENCE_NOTED`: record the normal presence fact (the append-only
   supersede mechanism keeps one live fact per person per step).

## 11. Division of actions

| Action                                                 | operations_agent      | Rafael (Owner) |
| ------------------------------------------------------ | --------------------- | -------------- |
| Seat assignment / release (single operator, C6)        | YES                   | no             |
| Start journey / start & complete steps                 | YES                   | backup         |
| Start boarding, record PRESENT / BOARDED / DISEMBARKED | YES                   | backup         |
| `ABSENCE_NOTED`                                        | YES                   | backup         |
| `NO_SHOW_CONFIRMED`                                    | NO (owner/admin only) | YES            |
| Authorize departure                                    | NO (owner/admin only) | YES            |
| Skip a journey step                                    | NO (owner/admin only) | YES            |
| Change operation status / complete operation           | NO                    | YES            |
| Publish in-app messages                                | YES                   | YES            |
| Grant / revoke participant access                      | YES                   | YES            |
| Retract a presence fact (correction)                   | NO                    | YES            |

Rafael must be reachable by phone at all times during the window (C2).

## 12. Manual fallback

Printed sheet carried by the operator: roster with phone numbers, seat map A01–A05,
itinerary with expected times, driver + vehicle plate, Rafael's number.
If COBS is unavailable: run the tour on paper, timestamp every fact by hand, and
backfill nothing — record only an Observation Log entry after the tour. Never modify
COBS during the live pilot to work around a product bug.

## 13. Success criteria (measurable)

1. All 5 travelers reach `confirmed` before T0.
2. Vehicle effective capacity known and >= 5 before the first seat assignment.
3. 5 distinct labeled seats assigned on L1, none blank, no duplicate label.
4. 5 distinct labeled seats assigned on L2, same person -> same label as L1.
5. A 6th seat attempt (if ever triggered) is rejected with the capacity message.
6. All 5 travelers claim Portal access before T0 (reachable 5/5).
7. Each traveler has an individual `PRESENT_AT_MEETING_POINT` fact on step 1.
8. Each traveler has an individual `BOARDED` fact on step 2, after `BOARDING_STARTED`.
9. Outbound reconciliation 5/5 recorded before departure authorization.
10. Departure authorized by Rafael on both legs before `DEPARTED`.
11. Each traveler has an individual `BOARDED` fact on step 6 (return).
12. Return reconciliation 5/5 recorded before return departure.
13. At least one in-app message published and read by at least 4 of 5 travelers.
14. Live page current/next state stays correct past 40 and past 100 journey events.
15. All 8 journey steps completed or explicitly skipped by Rafael.
16. Operation completed by Rafael with runtime evidence present.
17. Zero unexplained errors surfaced to the operator (any error shown must be a known, mapped message).
18. Zero manual database corrections required during or after the pilot.

Count: 18.

## 14. Automatic FAIL conditions

1. Any seat assigned while effective capacity is NULL.
2. Two active assignments sharing a label on the same leg.
3. Any blank/unnumbered seat assigned.
4. Departure occurring without owner authorization.
5. Departure occurring with an unreconciled seat/boarded mismatch.
6. A traveler transported without an individual boarding fact.
7. Live page showing a wrong current/next step during the run.
8. Any raw/untranslated database error shown to the operator.
9. Any direct SQL mutation of production data during the pilot.
10. Golden Pilot `CITYTO-20260815` altered in any way.
11. Operation completed while a step is neither completed nor skipped.
12. Seat assignments performed concurrently by two operators (violates C6).

Count: 12.

## 15. Post-pilot audit checklist

1. Read-only census: participations, seat assignments (active + released), presence facts,
   journey events, transport events, messages and deliveries.
2. Verify one live presence fact per traveler per presence-bearing step.
3. Verify seat history is append-only (releases present, no deletions).
4. Verify no capacity breach ever occurred on either leg.
5. Verify message read state per traveler.
6. Verify every state transition has an actor and a timestamp.
7. Compare the paper fallback sheet against the system record; list every divergence.
8. Triage findings as P0/P1/P2 and record them in an Observation Log.
9. Update memory + `docs/POST-PILOT-02-AUDIT.md`; decide PILOT-03 / W11 readiness.
10. Confirm Golden Pilot and Pilot-02 both intact; no cleanup, no truncation.

## 16. Open inputs required before P1 (real selection)

Date and time window; the 5 real traveler identities and contacts; driver identity;
field operator identity and their `operations_agent` invitation; vehicle plate and real
seat capacity; offering to reuse; meeting point and itinerary stops.
