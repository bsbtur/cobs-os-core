# COBS OS — PILOT-01 · P0 FIRST REAL PILOT DEFINITION & SAFETY ENVELOPE

Date: 2026-08-11 (UTC) · Scope: definition only
Nothing was created: no Operation, no travelers, no orders, no invitations, no schema change. W11 remains closed.
The BSBTUR tenant is **PRODUCTION DATA** from this document onward.

---

## A — PILOT SELECTION CRITERIA

An eligible Pilot-01 candidate must satisfy **all** of the following:

| #   | Criterion     | Requirement                                                                         |
| --- | ------------- | ----------------------------------------------------------------------------------- |
| A1  | Duration      | Single operating day, ≤ 12 hours, daylight                                          |
| A2  | Group size    | 5–15 real travelers                                                                 |
| A3  | Supervision   | 1 Owner physically present and actively supervising                                 |
| A4  | Transport     | 1 vehicle, outbound + return only, no transfer chaining, no dispatch chaining       |
| A5  | Itinerary     | 3–8 traveler-facing journey steps, linear, no branching                             |
| A6  | Hospitality   | Preferably none; if unavoidable, 1 property / single night / ≤ 8 rooms              |
| A7  | Commerce      | No external payment provider; either no live financial use or manual recording only |
| A8  | Communication | In-app only, no external messaging provider                                         |
| A9  | Integrations  | None. Zero experimental or unverified dependencies                                  |
| A10 | Connectivity  | Reliable cellular coverage along the whole route                                    |
| A11 | Fallback      | Full manual fallback (Section D) possible for every step                            |
| A12 | Geography     | Domestic (Brazil), familiar route, known supplier                                   |
| A13 | Safety        | COBS failure degrades convenience only — never traveler safety                      |
| A14 | Storage       | No file uploads / no Storage dependency (P2-09)                                     |

**Rejected for Pilot-01:** large academic caravan; multi-hotel operation; multi-day congress; high-value or high-volume commerce; international operation; anything depending on unverified integrations; any operation where a COBS failure could endanger a traveler.

---

## B — RECOMMENDED PILOT ENVELOPE

| Dimension             | Recommendation                                                                                         | Hard ceiling                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Travelers             | 8–12                                                                                                   | **15**                                                                 |
| Operators             | 1 Owner supervising; a second actor **only** if already legitimately provisioned as `operations_agent` | 2                                                                      |
| Duration              | 1 operating day                                                                                        | 12 h                                                                   |
| Transport             | 1 vehicle, 1 outbound + 1 return leg                                                                   | 2 legs                                                                 |
| Journey               | 4–6 traveler-facing steps                                                                              | 8                                                                      |
| Hospitality           | **NONE**                                                                                               | 1 property / 1 night / 8 rooms if unavoidable                          |
| Event production      | Only if naturally part of the operation                                                                | 1 internal event / 3 sessions                                          |
| Communication         | In-app only; 3–6 real operational messages                                                             | no bulk channel                                                        |
| Commerce              | **Option A — no live financial use** (recommended)                                                     | Option B: ≤ 15 orders, manual payment recording, no TTL-dependent flow |
| Participant portal    | **YES — mandatory**, individually granted, read-only                                                   | revocable at any time                                                  |
| Seats                 | Optional; if used, validates own-seat privacy                                                          | —                                                                      |
| Storage / uploads     | Prohibited                                                                                             | —                                                                      |
| External integrations | None                                                                                                   | —                                                                      |

This envelope is a subset of the M6 Phase I envelope and never exceeds it.

---

## C — SUCCESS CRITERIA (17, all measurable)

| #   | Criterion                                                | Measurement                                                                                    |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Operation created correctly                              | Operation exists with correct experience/offering, dates, tenant; lifecycle state as planned   |
| 2   | Real participants onboarded without identity duplication | Person count == real traveler count; zero duplicate person per (tenant, identifying attribute) |
| 3   | Traveler access works                                    | Each granted traveler reaches `/my` and sees exactly their operation                           |
| 4   | Journey appears correctly                                | Traveler-visible steps == operator-planned steps, same order and times                         |
| 5   | Planned vs Expected coherent                             | No Expected value contradicts a frozen Planned value; deltas explainable                       |
| 6   | Mobility information correct                             | Leg times/vehicle/driver shown match the physical reality                                      |
| 7   | Own-seat privacy                                         | A traveler sees only their own seat; no manifest exposure                                      |
| 8   | Communication reaches recipient                          | Every published message confirmed received in the intended inbox(es)                           |
| 9   | Runtime facts reflect reality                            | Presence, departure/arrival, step completion match the incident log timeline                   |
| 10  | No direct production DML                                 | Zero manual SQL writes during the operating day                                                |
| 11  | No cross-participant leak                                | No traveler reports or is shown another traveler's data                                        |
| 12  | No SEV-1 incident                                        | Zero incidents causing traveler-facing operational failure attributable to COBS                |
| 13  | Recovery command works                                   | If a correction was needed, an approved append-only command resolved it                        |
| 14  | Legitimate terminal state                                | Operation completed; all steps/legs/sessions/stays terminal                                    |
| 15  | Audit history coherent                                   | `audit_events` sequence explains every state transition, no gaps                               |
| 16  | Backup executed                                          | Day-close backup artifact produced and stored per Phase G                                      |
| 17  | Reconciliation clean                                     | Post-operation physical vs digital review finds no unexplained divergence                      |

Pilot-01 is a PASS when 1–17 hold. Failure of 10, 11 or 12 is an automatic FAIL.

---

## D — MANUAL FALLBACK (mandatory, offline)

Printed or stored offline on the Owner's device before departure; carried physically.

| Item                                | Minimum content                                                  | Deliberately excluded                                                 |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Passenger roster                    | Full name + seat (if used)                                       | documents, birth dates, addresses                                     |
| Emergency contacts                  | One contact name + phone per traveler                            | relationship details, medical notes beyond a strict need-to-know line |
| Itinerary                           | Times, locations, meeting points                                 | internal margins, costs                                               |
| Transportation                      | Vehicle plate, driver name, driver phone, pickup/return times    | driver personal documents                                             |
| Accommodation (if used)             | Property name, address, phone, rooming list                      | rate/contract data                                                    |
| Critical phone numbers              | Owner, driver, property, supplier, local emergency (192/193/190) | —                                                                     |
| Payment evidence (if commerce used) | Receipt/proof reference per order                                | card data, full payer documents                                       |

Rules: paper copy + one offline device copy; carried by the Owner only; not shared in group chats; destroyed after post-operation reconciliation. The operation must be fully executable with COBS offline.

---

## E — M6 P2 COMPENSATING CONTROLS → PILOT-01 ACTIONS (9/9 mapped)

| P2                                            | Pilot-01 action                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2-01** durable client errors absent        | Owner keeps browser devtools console open on the operator device. Any `[COBS_OBS]` `error` envelope is screenshotted/copied into the Observation Log **immediately**, before navigating away. Console is checked at every milestone poll.                                                                                                                                                                                                                      |
| **P2-02** no correlation_id                   | Every incident records: UTC timestamp (to the minute), tenant `bsbtur`, operation id, actor (owner/agent/traveler role), screen/domain, command name. Investigation = timestamp-window query on `audit_events` + the domain event table, filtered by that operation.                                                                                                                                                                                           |
| **P2-03** no automated alerting               | Owner polls `/api/public/health` and the console at T-24h, T-2h, operation start, every milestone, at least hourly, and at day close (M6 Phase F cadence).                                                                                                                                                                                                                                                                                                     |
| **P2-04** no scheduled backup                 | `python3 scripts/backup/gen_backup.py` before any structural change, after any structural change, and at day close. Artifact stored in the protected location, treated as PII-bearing, never restored into production.                                                                                                                                                                                                                                         |
| **P2-05** single Owner (bus factor)           | Continuity without shared credentials: (a) Owner keeps recovery access to the owner mailbox on a second device; (b) if a second actor is legitimately provisioned as `operations_agent`, they hold the manual fallback pack and can run the operation on paper; (c) no password sharing, no shared account, no service_role use. If the Owner becomes unavailable, the operation continues **manually** and COBS writes are suspended until the Owner returns. |
| **P2-06** silent RLS denials                  | Apparent empty state → verify in order: (1) is the person a participation on this operation? (2) does an `active` participant access grant exist? (3) is the operator's membership/role correct? (4) is the correct operation selected? Only after all four are confirmed is it treated as a defect and logged.                                                                                                                                                |
| **P2-07** React warning (OBS-M1-005)          | Monitor only. Ignore as a known signature when triaging; escalate **only** if accompanied by a functional failure in the same interaction.                                                                                                                                                                                                                                                                                                                     |
| **P2-08** legacy `authenticated` write grants | No architectural change during Pilot-01. Verify the ACL/RLS census before the pilot: 50/50 RLS enabled, 0 anon grants, exactly 16 privileges over 8 tables. ACL normalization goes to the post-pilot backlog.                                                                                                                                                                                                                                                  |
| **P2-09** Storage recovery unverified         | Pilot-01 makes **no** operational use of Storage. No file uploads, no document attachments, no image-dependent workflow.                                                                                                                                                                                                                                                                                                                                       |

---

## F — DATA CONSTITUTION (binding from Pilot-01 onward)

The `bsbtur` tenant holds **REAL PRODUCTION DATA**. Real data is never a QA fixture.

Prohibited, permanently:

1. Global cleanup of tenant data.
2. `TRUNCATE` on any production table.
3. Running any verification/adversarial harness against the real tenant.
4. Destructive fixture reset of any kind.
5. `service_role` impersonation for convenience.
6. Direct DML to "fix" history.
7. Deleting or editing audit, runtime or financial history.

Required:

- Corrections use approved domain commands only (`retract_presence_fact`, `reinstate_operation`, correction messages, payment reversal/refund facts, room/seat release + re-assign).
- Runtime history append-only. Financial history append-only. Audit evidence immutable.
- Backup before **and** after every structural production change.
- Any future test data lives in a separate tenant or an isolated restore target — never in `bsbtur`.

**GLOBAL_CLEANUP_AFTER_PILOT_DATA: PROHIBITED.**

---

## G — PILOT OBSERVATION LOG (separate from immutable domain facts)

Kept outside the database (spreadsheet or markdown file), never mixed with domain events. One row per meaningful finding.

| Field                | Notes                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `timestamp_utc`      | minute precision                                                                                     |
| `phase`              | before / during / after                                                                              |
| `screen_or_domain`   | e.g. mobility, portal `/my`, communication                                                           |
| `expected_behaviour` | one line                                                                                             |
| `observed_behaviour` | one line                                                                                             |
| `severity`           | SEV-1 traveler-facing failure · SEV-2 operator blocked, workaround exists · SEV-3 cosmetic/confusing |
| `workaround`         | what was actually done                                                                               |
| `customer_impact`    | none / minor / visible / severe                                                                      |
| `status`             | resolved / unresolved                                                                                |
| `backlog_candidate`  | proposed item, one line                                                                              |

Prohibited in the log: traveler names or contacts, documents, tokens, links containing tokens, message bodies, credentials, raw payloads. Reference travelers as "Traveler 3", operations by id.

---

## H — GO / NO-GO FOR CREATING THE OPERATION

**NEEDS_PILOT_SELECTION** — the envelope, criteria, controls and constitution are defined and sufficient, but no actual BSBTUR trip/service has been selected. Nothing was created.

Rafael must provide, for one concrete upcoming BSBTUR service:

1. **Operation identity** — commercial name, date (single day), start and end times, city/region.
2. **Experience/offering** — what is sold/delivered (e.g. day tour, transfer + visit), and whether it recurs.
3. **Traveler count** — exact expected number (must be 5–15) and whether the list is final.
4. **Traveler data availability** — for each: full name, one contact channel, one emergency contact. Confirm consent to hold it in COBS.
5. **Journey outline** — the 3–8 traveler-facing steps with planned times and locations.
6. **Transport** — vehicle (type/plate), supplier, driver name + phone, pickup/return points and times, whether seats are assigned.
7. **Hospitality** — YES/NO; if YES, property, night, room count and rooming intent.
8. **Event production** — YES/NO; if YES, the ≤3 sessions.
9. **Commerce** — Option A (no live financial use) or Option B (manual recording); if B, order count and payment evidence format.
10. **Portal** — confirmation that travelers will be given individual portal access and who explains it to them.
11. **Operators** — Owner confirmed on-site; second `operations_agent` YES/NO (and whether already provisioned).
12. **Connectivity** — confirmation of reliable coverage along the route.
13. **Fallback owner** — who carries the printed pack.

On receipt, the next step is a short PILOT-01 P1 mapping (real data → COBS objects) and only then Operation creation.

---

## FINAL REPORT

```text
PILOT_01_P0_DEFINITION:            PASS
RECOMMENDED_TRAVELER_MAX:          15  (target band 8–12)
RECOMMENDED_DURATION:              1 operating day (<= 12h, daylight, domestic)
HOSPITALITY_REQUIRED:              NO  (OPTIONAL only if intrinsic to the selected service)
LIVE_COMMERCE_RECOMMENDED:         NO  (LIMITED manual recording acceptable as fallback option B)
PARTICIPANT_PORTAL_REQUIRED:       YES
MANUAL_FALLBACK_DEFINED:           YES
M6_P2_CONTROLS_MAPPED:             9 / 9
SUCCESS_CRITERIA_DEFINED:          17
REAL_DATA_CONSTITUTION_DEFINED:    YES
GLOBAL_CLEANUP_AFTER_PILOT_DATA:   PROHIBITED
W11_STARTED:                       NO
REAL_OPERATION_CREATED:            NO
PILOT_CREATION_DECISION:           NEEDS_PILOT_SELECTION
```
