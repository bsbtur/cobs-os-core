# COBS OS → n8n · order.confirmed V1

Status: code foundation only. Do not send production traffic until staging migration, Edge Function deployment, n8n workflow, secrets, and E2E evidence pass the release gate.

## Objective

React to the canonical COBS order transition to `confirmed` without allowing n8n to own payment, reservation, order, or participant truth.

## Source of truth

`public.orders.status = confirmed` remains canonical. A database trigger materializes one pending `automation_events` row with:

- `event_type`: `order.confirmed`
- `source`: `cobs_db`
- stable idempotency key per order
- optional `operation_id`
- minimal commercial payload

The transaction never calls n8n directly.

## Dispatch boundary

`automation-dispatcher` atomically claims pending/failed `cobs_db` events with bounded retries, sends them to the configured n8n webhook, and records dispatch evidence. Concurrent dispatchers must not claim the same row.

## n8n workflow V1

Recommended name: `COBS — ORDER CONFIRMED V1`

1. Webhook receives the shared COBS event envelope and validates the credential-backed webhook header.
2. Code node validates `schema_version = 1`, `event_type = order.confirmed`, UUID references, idempotency key, and payload shape.
3. Code/Set node creates a small onboarding context from the payload. Do not fetch or copy full customer history.
4. V1 performs no order/payment mutation and no automatic WhatsApp/email send.
5. HTTP callback posts `outcome=completed` to `automation-gateway?action=result` using the existing callback credential.
6. Callback may be metadata-only, e.g. `provider_metadata.workflow = cobs-order-confirmed-v1` and `provider_metadata.action = onboarding_prepared`.

## Incoming envelope

```json
{
  "schema_version": 1,
  "id": "<automation_event_uuid>",
  "tenant_id": "<tenant_uuid>",
  "operation_id": "<operation_uuid|null>",
  "event_type": "order.confirmed",
  "idempotency_key": "order.confirmed:<order_uuid>",
  "correlation_id": "<correlation_uuid>",
  "payload": {
    "order_id": "<order_uuid>",
    "reference_label": "<optional reference>",
    "grand_total_minor": 100,
    "currency": "BRL",
    "confirmed_at": "<timestamp>",
    "confirmation_mode": "manual|provider",
    "provider": "<optional provider>"
  },
  "created_at": "<timestamp>"
}
```

## Successful callback

```json
{
  "event_id": "<automation_event_uuid>",
  "tenant_id": "<tenant_uuid>",
  "outcome": "completed",
  "provider_metadata": {
    "workflow": "cobs-order-confirmed-v1",
    "action": "onboarding_prepared"
  }
}
```

## Failure callback

```json
{
  "event_id": "<automation_event_uuid>",
  "tenant_id": "<tenant_uuid>",
  "outcome": "failed",
  "error_code": "<bounded code>",
  "error_message": "<bounded operational message>",
  "provider_metadata": {
    "workflow": "cobs-order-confirmed-v1"
  }
}
```

## Hard rules

- n8n never confirms payment or order status.
- n8n never creates financial facts.
- n8n is not used to solve Commerce → Participant materialization.
- No automatic outbound customer message in V1 before channel credentials, consent/template rules, and audit behavior are separately validated.
- Do not expose Supabase, n8n, payment, or callback secrets in workflow JSON, browser code, screenshots, logs, or documentation.

## Staging release gate

1. Migration applies cleanly to the explicit staging project.
2. Existing `lead.created` behavior remains valid.
3. Manual `submitted → confirmed` creates exactly one pending `order.confirmed` event.
4. Provider confirmation creates exactly one pending `order.confirmed` event.
5. Repeated confirmation/idempotent calls do not create a second event.
6. Dispatcher rejects wrong internal token.
7. Dispatcher claims a bounded batch once and moves successful rows to `dispatched`.
8. Failed n8n delivery is retried within the configured attempt limit.
9. n8n accepts one fresh event and returns a metadata-only completed callback.
10. Matching `automation_results` and `audit_events` evidence exists under the correct tenant.
11. `main`, production database, and frozen V1 remain unchanged until an explicit release decision.
