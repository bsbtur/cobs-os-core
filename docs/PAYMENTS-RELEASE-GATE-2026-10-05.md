# Payments release gate — CIOSP 2027

Date: 2026-10-05

## Result

**PASS** — CIOSP Pix sandbox settlement flow completed end to end with webhook-authoritative financial recording.

## Evidence

- Order: `82d94ece-da15-4c29-9ef3-33565defcdf8`
- Provider order: `ORDTST01M46B4XE8PRHP9MWFJF74YQNR`
- Provider payment: `PAY01M46B4XF2BCYMAQ7GMN9J5B3V`
- Environment: `test`
- Entry amount: `349000` minor units (R$ 3.490,00)
- Provider status: `processed`
- Provider status detail: `accredited`
- Webhook result: HTTP 200
- Webhook signature: valid HMAC
- Financial fact:
  - `fact_type = PAYMENT_RECORDED`
  - `amount_minor = 349000`
  - `reference = mercado_pago:PAY01M46B4XF2BCYMAQ7GMN9J5B3V`

This confirms that provider approval alone is not the settlement authority. The financial fact is recorded only after a valid webhook reaches the authoritative webhook path.

## Production probe evidence

A controlled R$ 1,00 production webhook probe also passed HMAC validation without creating commercial revenue for the QA order.

## QA helper retirement

The temporary Edge Functions below were retired after this gate passed:

- `qa-mp-test-order-process-once`
- `qa-mp-signed-webhook-once`

They now return HTTP 410 `qa_helper_retired` and must not be used as operational payment paths.

## Related change

PR #406 routes authenticated CIOSP QA checkout through the Mercado Pago sandbox Pix path while keeping public/production checkout on the production rail.

## Release decision

Payment gate: **PASS**

The payments release blocker represented by the CIOSP Pix sandbox settlement proof is closed. Further payment changes should preserve webhook-authoritative settlement, environment isolation, idempotency, and correlation checks.
