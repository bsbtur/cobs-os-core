# Participant operational summary QA

This runbook validates the canonical participant counters without changing the W04 readiness contract.

## Preconditions

Use a disposable or pilot operation with exactly three `participant` roster rows and no cancelled rows. The operation must have at least one journey step that supports presence and, for boarding validation, a step whose `presence_requirement = 'boarded'`.

The canonical read is always:

```sql
select public.get_operation_participant_summary('<operation-id>'::uuid);
```

Do not derive these counters independently in the browser.

## Scenario

### 1. Three planned, zero confirmed

Roster:

- Traveler A: expected
- Traveler B: expected
- Traveler C: expected

Expected summary:

```text
planned=3
confirmed=0
unconfirmed=3
present=0
boarded=0
no_show=0
```

### 2. Confirm all three

Use the normal application/RPC path (`set_participation_status`) to confirm A, B and C.

Expected summary:

```text
planned=3
confirmed=3
unconfirmed=0
present=0
boarded=0
no_show=0
```

The summary UI should refresh automatically after each status mutation. It may use Postgres Realtime when available, with the 20-second query polling as a fallback.

### 3. Presence A and B, no-show C

Record an effective presence fact for A and B at the relevant step. Confirm C as no-show using the normal RPC and required reason.

Expected summary:

```text
planned=3
confirmed=3
unconfirmed=0
present=2
boarded=0
no_show=1
```

The no-show fact must remain auditable. A later retraction must remove it from the effective counter without deleting history.

### 4. Board A and B

After `BOARDING_STARTED`, record `BOARDED` for A and B.

Expected summary:

```text
planned=3
confirmed=3
unconfirmed=0
present=2
boarded=2
no_show=1
```

`present` is intentionally not reduced by boarding. It represents travelers with an effective positive presence fact, while `boarded` is the stricter subset/current boarding fact used for operational display.

### 5. Complete the operation

Complete the runtime through the normal lifecycle path. Historical counters remain visible.

Expected health:

```text
health.status=under_control
health.reason_code=null
```

A completed or cancelled operation must not retain a stale attention state solely because confirmed/present/boarded counts differ from planning counters.

## Regression checks

1. `w04_step_readiness` still evaluates confirmed roster members only.
2. `ABSENCE_NOTED` never satisfies readiness.
3. Retracted presence facts do not count in the summary.
4. `PRESENCE_RETRACTED` markers themselves never count as presence.
5. Replaying an idempotent write does not increment any counter twice.
6. Roster cancellation removes the row from the active planned population according to the canonical function contract.
7. The UI does not estimate counters locally if the canonical RPC fails.
8. Summary refresh does not require a full page reload after roster, presence, boarding, no-show or terminal operation changes.

## Read-only diagnostic query

For troubleshooting a specific operation, compare the canonical result with raw active roster state:

```sql
select
  p.id as participation_id,
  p.participation_kind,
  p.status,
  pe.full_name
from public.operation_participations p
join public.people pe on pe.id = p.person_id
where p.operation_id = '<operation-id>'::uuid
order by pe.full_name;

select public.get_operation_participant_summary('<operation-id>'::uuid);
```

Use the raw query only for diagnosis. Product surfaces must consume the canonical function.
