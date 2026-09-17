# PROD LIVE R$1 — implementation state

Branch: `feat/prod-live-r1-payment-gate`

## Implemented in branch

- release protocol and PASS/FAIL criteria;
- isolated private one-shot gate schema, hard-pinned to BRL 1.00 / Mercado Pago / PIX / production;
- browser roles explicitly revoked from the gate table;
- locked Edge Function skeleton that returns 423 and cannot call Mercado Pago;
- tests asserting the execution lock and database invariants.

## Not implemented / intentionally blocked

- no fixture order has been created;
- no production migration has been applied;
- no Edge Function has been deployed;
- no LIVE credential is read by the locked function;
- no payment charge or attempt has been created;
- no Mercado Pago API call has been made;
- no PIX has been generated;
- no money has moved;
- canonical CIOSP public sales remain closed.

## Next gate

Run CI/review on this preparation branch. Only after the preparation is accepted should a second, separate commit implement the server-side preflight and one-shot unlock. The provider call remains a human checkpoint after deployment/preflight.
