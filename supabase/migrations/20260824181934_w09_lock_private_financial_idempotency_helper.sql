revoke all on function app_private.w09_require_financial_idempotency(text) from public;
revoke all on function app_private.w09_require_financial_idempotency(text) from anon;
revoke all on function app_private.w09_require_financial_idempotency(text) from authenticated;
comment on function app_private.w09_require_financial_idempotency(text) is
'Internal-only helper. Requires a bounded non-empty idempotency key for financial mutations so retries cannot create duplicate financial facts.';