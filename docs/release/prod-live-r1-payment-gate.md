# PROD LIVE R$1 Payment Gate

Status: IMPLEMENTATION PREPARED — CHARGE EXECUTION LOCKED

Purpose: validate the final Mercado Pago LIVE payment/webhook/idempotency release gate with BRL 1.00 without changing the canonical CIOSP commercial price or opening public sales.

## Non-negotiable invariants

- Canonical CIOSP operation `CIOSP-SP-2027` remains commercially unchanged.
- Canonical package remains BRL 12,490.00 and its entry remains BRL 3,490.00.
- `sales_public` remains false during this gate.
- Public frontend remains closed during this gate.
- The LIVE fixture must be isolated, non-public and explicitly marked as a release-gate fixture.
- Amount is exactly 100 minor units (BRL 1.00).
- Provider environment is exactly `production`.
- Provider is exactly `mercado_pago`; method is exactly `pix`.
- LIVE credentials stay server-side and must never be persisted in fixture metadata, logs, commits or UI.
- The payment attempt must use a persisted idempotency key and reuse an existing open attempt instead of creating another provider payment.
- A successful provider payment must produce exactly one canonical financial payment fact.
- Repeated provider/webhook processing must not duplicate the financial payment.
- After PASS, the fixture must be retired/disabled; it must not become a general-purpose production endpoint.

## Required evidence before provider call

Capture/read-only verify:

1. fixture order id and explicit LIVE release-gate marker;
2. order total = 100 minor;
3. exactly one item, quantity 1, unit amount = 100 minor;
4. no prior successful financial payment for the fixture order;
5. no unrelated open LIVE charge/attempt for the fixture;
6. canonical CIOSP offering still has `sales_public=false`;
7. canonical CIOSP price/payment schedule are unchanged.

## STOP checkpoint

Preparing/deploying the fixture is not authorization to create a LIVE Mercado Pago order.

The first HTTP request that can create a real Mercado Pago PIX must only be executed after an explicit human approval for the BRL 1.00 LIVE charge.

## PASS criteria

- one LIVE PIX for BRL 1.00 is created;
- payment is actually approved by Mercado Pago;
- webhook is received and accepted by COBS;
- exactly one `PAYMENT_RECORDED` financial fact for BRL 1.00 exists for the fixture order;
- charge/attempt provider identifiers are consistent;
- reload/retry reuses or rejects safely and does not create a second payment;
- duplicate/delayed webhook does not duplicate the financial fact;
- fixture is retired after evidence capture.

## FAIL / rollback

If any invariant fails, do not open `sales_public`. Keep the canonical CIOSP checkout closed, preserve evidence, retire/cancel only the isolated fixture artifacts when safe, fix the smallest root cause, and repeat only the failed gate.
