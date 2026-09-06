# Frozen commercial evidence

V3 does not infer promises from the current mutable catalog. Before generation, the commercial path must persist into the order metadata:

- a customer-readable payment plan (`payment_plan_display`);
- an immutable offer/program object (`offer_snapshot`) identifying what the customer accepted.

This is intentionally fail-closed. Existing orders lacking these fields require an explicit migration/backfill decision based on their actual historical offer; the generator must not invent it.
