# PROD LIVE R$1 risk register

- Accidental real charge during development — mitigated by locked 423-only function with no provider URL/token lookup.
- CIOSP commercial contamination — mitigated by separate fixture/gate and invariant forbidding changes to canonical CIOSP price/schedule/public-sales state.
- Public abuse — gate table is private; public/anon/authenticated privileges revoked; endpoint must remain non-customer-facing.
- Duplicate payment — unlock design requires persisted idempotency, reuse of open attempt, exactly-once financial fact and duplicate webhook verification.
- Forgotten test surface — PASS requires fixture retirement and temporary endpoint retirement/disablement.
