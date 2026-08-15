# PX12.5 — Journey Alerts / Alertas de Equipe V1

Status: architecture contract ready for implementation.

## Objective

Create an internal, in-app alert layer for operational staff using canonical schedule and operation data. V1 deliberately does not send WhatsApp, SMS, email or external push.

## Existing canonical communication core

The CLEAN BUILD already contains the W07 communication domain:

- `messages`
- `message_audience_selectors`
- `message_recipients`
- `message_deliveries`
- `communication_events`
- `communication_outbox`
- `communication_devices`

Canonical RPCs already available include:

- `create_message`
- `set_message_audience`
- `publish_message`
- `get_my_message_inbox`
- `get_my_messages`
- `mark_message_read`

PX12.5 must reuse this domain. It must not create a second notifications/messages table.

## Source events

V1 derives alerts from `operation_staff_assignments`:

1. `report_at - 15 minutes`
   - reminder that presentation/check-in time is approaching.
2. `starts_at - 15 minutes`
   - reminder that assigned operational work starts soon.
3. `ends_at - 15 minutes`
   - reminder that the scheduled work window is approaching its end.

Only active assignments (`assigned`, `confirmed`) are eligible. Declined/cancelled/completed assignments do not generate future reminders.

## Recipient

The recipient is the `person_id` attached to the canonical `operation_participation` referenced by the staff assignment.

No audience expansion is allowed in V1: one assignment reminder targets the assigned person only.

## Idempotency

Every generated reminder must have a deterministic key derived from:

`staff_assignment_id + milestone + milestone_timestamp`

Example conceptual key:

`staff-alert:<assignment_uuid>:report_at:2026-08-15T10:45:00Z`

Repeated scheduler executions must not create duplicate reminders.

## Delivery

V1 delivery is IN-APP only.

The alert is represented by a canonical published `messages` record and its canonical recipient/read state. `mark_message_read` remains the only read mutation path.

Do not enqueue WhatsApp, SMS, email or push delivery in PX12.5 V1.

## Priority

Default reminders are `normal` priority. A future version may elevate priority based on lateness, unresolved critical playbooks or operational incidents. That escalation is explicitly outside V1.

## Human copy

Copy must be short, actionable and humanized.

Examples:

- `Bom dia, Carlos. Sua apresentação para City Tour Brasília é às 07:45.`
- `Seu trabalho como Motorista começa em 15 minutos.`
- `Faltam 15 minutos para o fim da sua escala nesta operação.`

The exact copy should use the operation name and operational role when available.

## Security

- Scheduler/service generation must use a controlled backend path.
- Users can only read messages for which canonical recipient rules grant access.
- Users cannot forge staff reminders by direct table insert.
- Tenant and operation boundaries remain mandatory.
- Generation must be idempotent.

## UX contract

The Command Center should expose a compact `Alertas para mim` surface above or adjacent to `Meu Dia` when unread operational reminders exist.

Each alert shows:

- time / relative urgency;
- title;
- concise body;
- operation context;
- unread/read state;
- action to open the relevant operation;
- action to mark as read.

The UI must use `get_my_message_inbox`/canonical message reads rather than querying raw recipient tables as an alternative authorization model.

## Explicit non-goals

PX12.5 V1 does not implement:

- WhatsApp;
- external push;
- sound;
- quiet hours;
- labor time clock;
- payroll;
- attendance geolocation;
- escalation chains;
- AI-generated alert copy;
- arbitrary user-created automation rules.

These can be layered later after internal alert behavior is validated.

## Implementation gates

1. Inspect W07 RPC return contracts and enum values.
2. Implement idempotent staff-assignment reminder generation as a migration/RPC or scheduled backend primitive.
3. DB QA in rollback: due reminder, duplicate run, cancelled assignment, cross-tenant isolation, recipient correctness.
4. Add `Alertas para mim` inbox surface.
5. Build + preview QA.
6. Only after V1 validation evaluate sound/push/WhatsApp.