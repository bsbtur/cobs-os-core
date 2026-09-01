# Assistant Financial Context V1

Rebuilt from PR #91 on the current protected main baseline.

Scope:
- read-only canonical reservation context;
- read-only payment context for the selected traveler reservation/order;
- tenant, operation, active participant grant and beneficiary scoping;
- major currency-unit semantics for assistant consumption;
- no Mercado Pago provider mutation;
- no RBAC/RLS relaxation;
- no operational-alert changes.

Release gate:
1. Quality Gate must pass on this branch.
2. Authenticated pure-traveler E2E must confirm reservation/payment answers only from that traveler's canonical context.
3. Merge only after E2E PASS.
