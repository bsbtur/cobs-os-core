# CI note

CI is expected to validate source/migration safety only. CI must never invoke a LIVE payment provider or require a LIVE credential. A passing CI result is not evidence of a successful LIVE payment; the real BRL 1.00 provider/webhook/idempotency evidence is a separate controlled release step.
