# Provider confirmation entry threshold — QA 2026-09-06

Observed in STAGING on order `3d55e331-a379-4bfa-8455-61082c9cc8f3`:

- Mercado Pago sandbox payment for the entry charge was approved for 349000 minor units.
- `record_provider_payment` created exactly one financial fact for the provider reference.
- `confirm_paid_provider_order` rejected confirmation because the linked offering was no longer `sales_public=true`, causing the function to fall back to the full order total (1249000) as the confirmation threshold.
- The order had a schedule-aware public-checkout charge marked `commercial_payment_stage=entry`, installment 1, amount 349000.

Fix: use that immutable charge context as the entry confirmation threshold for public checkout entry payments. Other flows retain the existing public-offering fallback.

Expected retry behavior:

- provider payment fact remains idempotent by provider reference;
- order confirms after the contracted entry amount is reached;
- the original payment event can finish processing without inserting a second event or financial fact.
