# COBS OS → n8n · order.confirmed V1

Status: code foundation staged and hardened. Do not send production traffic until the n8n workflow and fresh end-to-end staging evidence pass the release gate.

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

`automation-dispatcher` atomically claims pending/failed `cobs_db` events with bounded retries, sends them to the dedicated n8n webhook, and records dispatch evidence. Concurrent dispatchers cannot claim the same row. Rows left in `processing` after a dispatcher crash are reclaimable after 5 minutes, still bounded to 3 total attempts.

The dedicated `order.confirmed` route can be configured explicitly with `N8N_ORDER_CONFIRMED_WEBHOOK_URL`; if it is absent, the dispatcher derives `/webhook/cobs-order-confirmed-v1` from the configured n8n commercial origin. It never intentionally sends `order.confirmed` to the lead webhook path.

The dispatcher is deployed, but **an invocation mechanism is still required before release**. Until a scheduler/runner calls it, pending outbox rows remain pending. Choose the simplest low-cost runner after the n8n workflow is proven; do not add polling inside the commerce transaction.

## Callback integrity

`automation-gateway?action=result` authenticates with the existing callback token and now binds each callback to the stored `automation_events` row before accepting the result.

- unknown/mismatched event + tenant is rejected
- completed `lead.created` requires the structured commercial fields
- completed `order.confirmed` accepts metadata-only completion and rejects lead-classification fields
- `automation_results` also enforces a composite event/tenant foreign key and one result per event

## n8n workflow V1

Recommended name: `COBS — ORDER CONFIRMED V1`

1. Webhook receives the shared COBS event envelope and validates the credential-backed webhook header.
2. Code node validates `schema_version = 1`, `event_type = order.confirmed`, UUID references, idempotency key, and payload shape.
3. Code/Set node creates a small onboarding context from the payload. Do not fetch or copy full customer history.
4. V1 performs no order/payment mutation and no automatic WhatsApp/email send.
5. HTTP callback posts `outcome=completed` to `automation-gateway?action=result` using the existing callback credential.
6. Callback is metadata-only, e.g. `provider_metadata.workflow = cobs-order-confirmed-v1` and `provider_metadata.action = onboarding_prepared`.

## Hard rules

- n8n never confirms payment or order status.
- n8n never creates financial facts.
- n8n is not used to solve Commerce → Participant materialization.
- No automatic outbound customer message in V1 before channel credentials, consent/template rules, and audit behavior are separately validated.
- Do not expose Supabase, n8n, payment, dispatcher, or callback secrets in workflow JSON, browser code, screenshots, logs, or documentation.

## Staging evidence already obtained

- migrations apply cleanly on STAGING `wzukfenbzwlwzhtadlxl`
- manual `submitted → confirmed` rollback test created exactly one pending `order.confirmed`
- repeated confirmed transitions for the same order produced only one event
- provider-paid confirmation RPC rollback test created exactly one pending `order.confirmed` with `confirmation_mode=provider` and `provider=mercado_pago`
- rollback restored the tested order/charge and left zero persisted test events
- atomic claim moved a pending event to `processing` and incremented attempts
- stale `processing` recovery reclaimed an event older than 5 minutes and incremented attempts while respecting the 3-attempt cap
- `automation-gateway` v5 is ACTIVE in STAGING with event-aware callback validation
- GitHub Quality Gate run #182 passed the hardened callback contract and tests

## Remaining staging release gate

1. Create/publish `COBS — ORDER CONFIRMED V1` in n8n at `/webhook/cobs-order-confirmed-v1` using existing COBS webhook/callback credentials.
2. Prove dispatcher rejects an incorrect internal token.
3. Invoke dispatcher against one fresh STAGING `order.confirmed` event and prove successful delivery becomes `dispatched`.
4. Prove one failed n8n delivery retries within the configured attempt limit.
5. Prove n8n accepts the fresh event and returns a metadata-only completed callback.
6. Match `automation_events`, `automation_results`, and `audit_events` under the same event/tenant/correlation evidence.
7. Select and validate the minimal dispatcher invocation mechanism for release.
8. Keep `main`, production database, and frozen V1 unchanged until explicit release decision.
