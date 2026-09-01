# Assistant Reservation Context V1 — Security invariants

1. Tenant and operation are taken from the authenticated conversation.
2. Profile ownership remains enforced by `assistant_submit_message` against `auth.uid()`.
3. Reservation helper independently revalidates operation access.
4. Person identity is resolved from an active, non-revoked participant access grant.
5. Reservation must belong to that beneficiary, tenant, and operation.
6. Only `reserved` or `confirmed` reservation states are eligible; cancelled orders are excluded.
7. No internal reservation/order/item IDs are exposed to the Router.
8. No payment, price, hotel, or schedule facts are inferred by this gate.
