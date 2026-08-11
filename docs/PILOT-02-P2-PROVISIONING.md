# PILOT-02 — P2 CONTROLLED PROVISIONING REPORT

Date executed: 2026-08-11 (America/Sao_Paulo)
Tenant: BSBTUR (production)
Mode: provisioning via legitimate public contracts only. No schema, RLS or ACL change.

## Operational window (Owner input, P2)

- Date: 11/08/2026
- Meeting: 12:00 (America/Sao_Paulo)
- Expected start: 12:00
- Expected end: 15:00

## Operation

| Field | Value |
| --- | --- |
| Name | City Tour Brasilia Essencial — Pilot-02 |
| Code | CITYES-20260811 |
| ID | 2d581923-534a-4fd6-8442-55ac425152ec |
| Origin | STANDALONE (no experience, no offering) |
| Status | draft (intentionally NOT ready / NOT active) |
| Planned window | 2026-08-11 12:00–15:00 America/Sao_Paulo |

## Roster

Travelers (participant, confirmed, consent 5/5):
Mariana Alves Ferreira (A01), Lucas Henrique Martins (A02), Camila Rodrigues Souza (A03),
Pedro Augusto Ribeiro (A04), Juliana Costa Nascimento (A05).

Crew (confirmed): Carlos Eduardo Mendes (role `driver`), Fernanda Lima Rocha (role `coordinator`).

## Mobility

- Vehicle EDZ2E87 — van — COBS capacity 18 (physical 20, not raised).
- Driver record created for Carlos Eduardo Mendes; assigned to both legs.
- Leg 1 (outbound): Torre de TV / Estacionamento Norte → Praca dos Tres Poderes, 12:30–13:00.
- Leg 2 (return): Praca dos Tres Poderes → Torre de TV / Estacionamento Norte, 14:25–14:50.
- Active seats: 5 outbound + 5 return, labels A01–A05, no duplicates, no blanks.

## Journey (8 steps)

1. Encontro / concentracao — meeting — accounted
2. Embarque de ida — boarding — boarded
3. Deslocamento de ida — movement — none (leg 1)
4. Chegada — arrival — none
5. Atividade / visita — activity — accounted
6. Embarque de retorno — boarding — boarded
7. Deslocamento de retorno — return — none (leg 2)
8. Desembarque / encerramento — disembarkation — none

No runtime facts created (0 journey events, 0 presence events). The 16 transport events are
provisioning records only (leg created / vehicle / driver / seat assigned) — no movement facts.

## Audit result

```
PILOT_02_P2_PROVISIONING: PASS (with 2 open items)

OPERATION_CREATED: YES
OPERATION_ID: 2d581923-534a-4fd6-8442-55ac425152ec
OPERATION_STATUS: draft

GOLDEN_PILOT_MODIFIED: NO

TRAVELERS_CREATED_OR_LINKED: 5/5
TRAVELERS_CONFIRMED: 5/5

DRIVER_CREATED_OR_LINKED: YES

SECOND_OPERATOR_IDENTITY_READY: NO (person record created; tenant invitation not yet issued)
SECOND_OPERATOR_ROLE: operations_agent (intended)
SECOND_OPERATOR_LOGIN_VALIDATED: NO

VEHICLE_CREATED_OR_LINKED: YES
VEHICLE_PLATE: EDZ2E87
VEHICLE_TYPE: van
VEHICLE_CAPACITY: 18

TRANSPORT_LEGS: 2/2

OUTBOUND_ACTIVE_SEATS: 5/5
RETURN_ACTIVE_SEATS: 5/5
DUPLICATE_SEATS: 0
BLANK_SEATS: 0

JOURNEY_STEPS: 8/8
RUNTIME_FACTS_CREATED: 0

PORTAL_ACCESS_PREPARED: 0/5 (roster ready; invitations must be issued from the COBS UI)
PORTAL_CLAIMED: 0/5
IN_APP_REACHABLE: 0/5

EXPERIENCE_CREATED: NO
OFFERING_CREATED: NO
COMMERCE_CREATED: NO
HOSPITALITY_CREATED: NO

DIRECT_DML_USED: NO (people records use the same RLS-guarded insert path as the roster UI)
SCHEMA_CHANGED: NO
RLS_CHANGED: NO
ACL_CHANGED: NO

READY_FOR_PRE_T0_GATE: NO — blocked by B1 and B2 below
```

## OPEN_BLOCKERS

- B1 — Portal access invitations for the 5 travelers must be issued by the Owner inside COBS
  (Operation → Participant Access). The one-time claim token is returned exactly once, to the
  issuing session, so it cannot be issued by tooling without losing the credential. Portal claim
  evidence (claimed N/5) can only be recorded after each traveler accepts.
- B2 — Fernanda Lima Rocha has no account. The Owner must send the tenant invitation with role
  `operations_agent` from COBS (Settings → Team), and Fernanda must complete login before PRE-T0.

## OPEN_WARNINGS

- W1 — Operation left in `draft`; PRE-T0 gate must move it to `ready`.
- W2 — Carlos Eduardo Mendes has no login and no personal contact on file; he operates offline
  (C2 keeps the Owner on call for privileged actions).
- W3 — C6 remains in force: seating changes by a single operator only.

## STOP

Provisioning complete. No operation started, no presence, no departure, no completion.
Awaiting explicit authorization: **PILOT-02 PRE-T0 GO/NO-GO**.
