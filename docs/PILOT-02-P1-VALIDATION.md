# PILOT-02 · P1 VALIDATION + PROVISIONING MANIFEST

**Mode:** P1 FINAL LOCK — VALIDATION ONLY. No entity, participation, vehicle, access, seat, leg, journey step, message or operation was created. No mutable RPC executed. No schema/RLS/ACL change. Golden Pilot `CITYTO-20260815` untouched.

**Date of validation:** 2026-08-11 (UTC)
**Tenant:** BSBTUR (production) — `9a09c18f-1279-4196-ad4d-929e93e348f2`

---

## 1. Live census (read-only, verified)

| Object | Count | Detail |
| --- | --- | --- |
| tenants | 1 | BSBTUR |
| experiences | 0 | none exist |
| offerings | 0 | none exist |
| operations | 1 | `CITYTO-20260815` — Golden Pilot, status `completed` |
| people | 3 | Rafael Lima (Owner), Pedro Paulo de Lima Santos Cardoso, Regina Aparecida Tiago de Moura |
| memberships | 1 | Owner only |
| vehicles | 1 | `JHR8B21`, kind `car`, capacity 3 |
| drivers | 1 | Regina Aparecida Tiago de Moura |
| transport_legs | 2 | Golden Pilot outbound + return |

---

## 2. Input lock status

### Travelers (5, independent identities)

| # | Full name | Controlled e-mail | Exists in COBS | Operational consent |
| --- | --- | --- | --- | --- |
| 1 | Mariana Alves Ferreira | designfrondf@gmail.com | NO | **YES** |
| 2 | Lucas Henrique Martins | bsbturltda@gmail.com | NO | **YES** |
| 3 | Camila Rodrigues Souza | imoveisdfvenda@gmail.com | NO | **YES** |
| 4 | Pedro Augusto Ribeiro | rafasaudedf@gmail.com | NO | **YES** |
| 5 | Juliana Costa Nascimento | zemiguelpoesias@gmail.com | NO | **YES** |

- `@example.com` placeholders are **discarded** and must never be provisioned.
- One identity per traveler. No shared account. No credential reuse.
- Pedro Augusto Ribeiro is a **different person** from the Golden Pilot's Pedro Paulo de Lima Santos Cardoso — a new Person record, never a reuse.
- `TRAVELER_CONSENT_CONFIRMED: 5/5 YES` — input lock complete.

### Driver

| Field | Value |
| --- | --- |
| Name given | Carlos Eduardo Mendes |
| Exists in COBS | NO |
| Real-driver confirmation | **YES** |
| Regina reuse | NOT authorized — Golden Pilot resource |

`DRIVER_CONFIRMED: YES` — input lock complete.

### Second operator

| Field | Value |
| --- | --- |
| SECOND_OPERATOR_REAL | YES |
| SECOND_OPERATOR_NAME | Fernanda Lima Rocha |
| SECOND_OPERATOR_EMAIL | contato@bsbtur.com.br |
| SECOND_OPERATOR_ROLE | operations_agent (never admin, never owner) |
| COBS_ACCOUNT_EXISTS | NO |
| ACCOUNT_CONFIRMED | NO |
| LOGIN_CONFIRMED | NO |
| PRE_T0_ACCOUNT_PROVISIONING_REQUIRED | YES |
| PRE_T0_LOGIN_VALIDATION_REQUIRED | YES |

`fernanda.rocha@example.com` is discarded.

### Vehicle

| Field | Value |
| --- | --- |
| VEHICLE_IDENTIFIER | EDZ2E87 |
| VEHICLE_TYPE | van |
| PHYSICAL_CAPACITY | 20 |
| COBS_OPERATIONAL_CAPACITY | 18 (intentional reduction — never auto-raise to 20) |
| PLANNED_OCCUPANCY | 7 (5 travelers + 1 driver + 1 operations_agent) |
| CAPACITY_HEADROOM | 11 |
| PHYSICAL_CAPACITY_EXCEEDED | NO |
| JHR8B21 reuse | FORBIDDEN (Golden Pilot resource, capacity 3) |
| PIL0T02 placeholder | DISCARDED — must not be created |

Capacity enforcement is live per DEF-PILOT-015: active seat assignments per leg ≤ effective capacity, serialized by a per-leg transaction lock.

### Date / operational window

| Field | Value |
| --- | --- |
| Original proposal | 11/08/2026 11:00–13:00 (America/Sao_Paulo) |
| Status | **INVALID** — the window is today and already started/passed; it also collides with the Golden Pilot's consumed expected window |
| New window | **PENDING — to be set at P2 provisioning** |

`OPERATIONAL_WINDOW: PENDING` — not a P1 input-lock blocker; final scheduling occurs during authorized P2 provisioning.

### Offering / Experience

`PILOT_02_OPERATION_ORIGIN: standalone`

`EXPERIENCE_CREATED: NO`
`OFFERING_CREATED: NO`

"City Tour Brasília Essencial — Circuito Cívico e Monumental — 2 horas" **does not exist** in COBS. Zero experiences and zero offerings are registered in BSBTUR.

Path selected: **Path A — standalone Operation** with no experience/offering lineage, identical to the certified Golden Pilot shape.

---

## 3. Provisioning Manifest (proposed — NOT executed)

Executed only after explicit textual authorization, in this order, exclusively through approved public commands.

### 3.1 Reuse (no writes)

- Tenant BSBTUR `9a09c18f-1279-4196-ad4d-929e93e348f2`
- Person + Owner membership: Rafael Lima (`cf022cd0-…`) — on call, unchanged
- Nothing else. No Golden Pilot record is read-modified, archived or relinked.

### 3.2 Create — identities (7 Person records)

| Person | Role in Pilot-02 | Login required |
| --- | --- | --- |
| Mariana Alves Ferreira | participant | Portal Claim (W10) |
| Lucas Henrique Martins | participant | Portal Claim (W10) |
| Camila Rodrigues Souza | participant | Portal Claim (W10) |
| Pedro Augusto Ribeiro | participant | Portal Claim (W10) |
| Juliana Costa Nascimento | participant | Portal Claim (W10) |
| Carlos Eduardo Mendes | crew (driver resource) | none — operational assignment never grants login |
| Fernanda Lima Rocha | crew + tenant membership | full COBS login, `operations_agent` |

### 3.3 Create — access

- 1 invitation → Fernanda Lima Rocha, role `operations_agent`, e-mail `contato@bsbtur.com.br`; she completes signup + e-mail confirmation herself; login validated pre-T0.
- 5 participant access grants/invitations (W10), one per traveler, operation-scoped and revocable — never memberships.

### 3.4 Create — resources

- 1 Vehicle: identifier/label `EDZ2E87`, kind `van`, capacity **18**.
- 1 Driver resource pointing at Person "Carlos Eduardo Mendes" (Person is canonical).

### 3.5 Create — operation

- 1 Operation, tourism, BR / DF / Brasília, `America/Sao_Paulo`, standalone (Path A).
- Planned window = the confirmed new date (baseline, frozen after creation).
- 7 participations: 5 `participant` (travelers), 2 `crew` (Carlos, Fernanda) — all to be **confirmed** pre-T0; `expected` never counts toward readiness.
- 1 operation role assignment: Fernanda as field operator.

### 3.6 Create — mobility

- 2 transport legs on vehicle `EDZ2E87`: outbound (seq 10) and return (seq 20), no capacity override (effective capacity = 18).
- 10 seat assignments: labels **A01–A05**, same label per traveler on both legs. No blank labels. No crew seats.

### 3.7 Create — journey

- 8 journey steps: meeting (`accounted`) → boarding (`boarded`) → movement → arrival → activity → boarding (`boarded`) → movement → arrival.

### 3.8 Out of scope (OFF)

Hospitality OFF · Event production OFF · Commerce OFF · External integrations OFF · No new workflow (W11 closed) · No schema/RLS/ACL change · No product code change during the live pilot.

---

## 4. Blocking gaps before P2

| # | Gap | Status | Owner |
| --- | --- | --- | --- |
| B1 | New operational date/window (day + start + end, America/Sao_Paulo) | PENDING — to be set at P2 provisioning | Rafael |
| B2 | Explicit operational-registration consent for all 5 travelers (SIM/NÃO each) | RESOLVED — 5/5 YES | Rafael |
| B3 | Confirmation that Carlos Eduardo Mendes is the real driver of this operation | RESOLVED — YES | Rafael |
| B4 | Offering path decision: A (standalone) or B (create catalog first) | RESOLVED — Path A | Rafael |
| B5 | Real vehicle kind for EDZ2E87 (minibus / bus / van) | RESOLVED — van | Rafael |

`HUMAN_INPUT_BLOCKERS: 0`

---

## 5. Status block

```
PILOT_02_P1_VALIDATION: FINAL_LOCKED
P1_FINAL_LOCK: YES
HUMAN_INPUT_BLOCKERS: 0
READY_FOR_P2_PROVISIONING: YES
P2_AUTHORIZED: NO
PILOT_02_OPERATION_ORIGIN: standalone
EXPERIENCE_CREATED: NO
OFFERING_CREATED: NO
TRAVELER_IDENTITIES_LOCKED: YES (5 controlled addresses)
TRAVELER_CONSENT_CONFIRMED: 5/5 YES
DRIVER_CONFIRMED: YES
DRIVER_NAME: Carlos Eduardo Mendes
SECOND_OPERATOR_REAL: YES
SECOND_OPERATOR_NAME: Fernanda Lima Rocha
SECOND_OPERATOR_EMAIL: contato@bsbtur.com.br
SECOND_OPERATOR_ROLE: operations_agent
COBS_ACCOUNT_EXISTS: NO
ACCOUNT_CONFIRMED: NO
LOGIN_CONFIRMED: NO
PRE_T0_ACCOUNT_PROVISIONING_REQUIRED: YES
PRE_T0_LOGIN_VALIDATION_REQUIRED: YES
VEHICLE_IDENTIFIER: EDZ2E87
VEHICLE_TYPE: van
PHYSICAL_CAPACITY: 20
COBS_OPERATIONAL_CAPACITY: 18
PLANNED_OCCUPANCY: 7
CAPACITY_HEADROOM: 11
PHYSICAL_CAPACITY_EXCEEDED: NO
JHR8B21_REUSED: NO
PIL0T02_CREATED: NO
OPERATIONAL_WINDOW: PENDING
OPERATIONAL_WINDOW_BLOCKER: NO
OFFERING_EXISTS: NO
OFFERING_PATH_DECIDED: YES
OFFERING_PATH: A (standalone)
GOLDEN_PILOT_MODIFIED: NO
DATA_MUTATED: NO
ENTITIES_CREATED: 0
```

**Next action gate:** P2 provisioning is **NOT authorized**. Await explicit textual authorization: `"AUTORIZO O PILOT-02 P2 PROVISIONING"` before any mutation.
