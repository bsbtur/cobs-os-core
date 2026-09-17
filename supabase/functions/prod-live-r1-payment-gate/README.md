# prod-live-r1-payment-gate

Temporary release-gate Edge Function for one controlled Mercado Pago LIVE PIX of BRL 1.00.

Current state: **LOCKED**.

The current implementation deliberately returns HTTP 423 and contains no Mercado Pago URL, no production credential lookup and no database write. Deploying this locked revision cannot create a charge.

Unlocking requires a separate reviewed commit that binds the function to `app_private.prod_live_payment_gates`, an isolated fixture order of exactly 100 minor units, server-only authorization, persisted idempotency and consume/retire semantics.

Never expose this as a customer-facing route and never use it to change the canonical CIOSP commercial terms.
