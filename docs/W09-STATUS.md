# COBS OS — W09 STATUS

Workflow: **W09 — Commerce & Payments Core**
State: **FROZEN** (2026-08-10)

| Gate                         | Result                               |
| ---------------------------- | ------------------------------------ |
| W09 ARCHITECTURE GATE        | PASS                                 |
| W09 FINAL BUILD CONTRACT     | PASS                                 |
| W09 BUILD                    | PASS                                 |
| W09 ADVERSARIAL VERIFICATION | PASS (101/101 assertions, 0 defects) |
| W09 SECURITY GATE            | PASS                                 |
| W09 ARCHITECTURE FROZEN      | YES                                  |

## Frozen structural surface

| Metric                        | Value                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| W09_TABLE_COUNT               | 6 (`sellables`, `prices`, `orders`, `order_items`, `commercial_reservations`, `financial_facts`) |
| W09_ENUM_COUNT                | 8                                                                                                |
| W09_FINANCIAL_FACT_TYPE_COUNT | 3                                                                                                |
| W09_MUTATING_COMMAND_COUNT    | 19                                                                                               |
| W09_READ_FUNCTION_COUNT       | 6                                                                                                |
| W09_PUBLIC_FUNCTION_COUNT     | 25                                                                                               |
| W09_PRIVATE_HELPER_COUNT      | 18                                                                                               |
| W09_REALTIME_TABLE_COUNT      | 1 (`financial_facts`)                                                                            |

`financial_fact_type` = `PAYMENT_RECORDED`, `PAYMENT_REVERSED`, `REFUND_RECORDED`.
`payment_method` = `cash`, `bank_transfer`, `other`. No `pix`, `boleto`, `card_manual`.

## RLS / ACL freeze

- RLS enabled on all six tables.
- `anon`: zero privileges (no table grants, no `app_private` USAGE).
- `authenticated`: `SELECT` only; direct `INSERT` / `UPDATE` / `DELETE` denied.
- All mutations flow through `SECURITY DEFINER` public commands.
- `member`: zero commerce access. `operations_agent`: order operations only, no money.
- Finance writes (`record_payment`, `reverse_payment`, `record_refund`): owner/admin only.
- Cross-tenant access blocked at every command and policy.
- No W09 `app_private` helper is executable by `authenticated` or `anon`. The only
  client-executable private functions are the documented RLS predicates
  (`has_tenant_role`, `is_tenant_member`, `w08_is_comms_operator`, `w08_current_person_id`).

## Money freeze

BIGINT minor units only. No floating point financial truth. No `tax_minor`,
`fee_minor`, provider settlement or provider balance.

```
line_subtotal_minor  = unit_amount_minor * quantity   (checked)
line_total_minor     = line_subtotal_minor - discount_minor
subtotal_minor       = SUM(line_subtotal_minor)
discount_total_minor = SUM(discount_minor)
grand_total_minor    = SUM(line_total_minor)
```

## Financial derivation freeze (never persisted as editable truth)

```
gross_recorded_payments = SUM(PAYMENT_RECORDED)
reversed_payments       = SUM(PAYMENT_REVERSED)
valid_paid              = gross_recorded_payments - reversed_payments
refunded                = SUM(REFUND_RECORDED)
net_paid                = valid_paid - refunded
outstanding_minor       = MAX(grand_total_minor - net_paid, 0)
overpaid_minor          = MAX(net_paid - grand_total_minor, 0)
```

## Capacity freeze

- Reservation is created at `submit_order`.
- TTL: **30 minutes, server controlled** (`app_private.w09_reservation_ttl`).
- `reserved` rows with `expires_at <= now()` do not consume effective capacity (lazy expiry).
- `confirm_order`: valid hold → confirm; expired hold → atomic reacquire; otherwise reject.
- No overselling: capacity is serialized by transaction-scoped advisory lock on the offering.
- Direct release of a `confirmed` reservation is DENIED for every role; it is released
  only atomically through `cancel_order`.
- A completed order retains its confirmed capacity.

## Accepted observations (architectural rulings)

### OBS-W09-001 — Overpayment

`OVERPAYMENT_ALLOWED_AND_EXPLICITLY_DERIVED = YES`.
A legitimate manually verified payment is never rejected because it pushes
`net_paid` above `grand_total_minor`, and money is never clamped or discarded.
Overpayment changes no total, no item price, and creates no automatic refund,
store credit, or transfer to another order. It is resolved explicitly by a later
`REFUND_RECORDED`, or by `PAYMENT_REVERSED` when the payment record itself was erroneous.

### OBS-W09-002 — Cancellation with existing payment

`ORDER_CANCELLATION_AUTO_REFUNDS = NO`
`CANCELLED_ORDER_CAN_RETAIN_NET_PAID = YES`.
Cancelling an order withdraws the commercial commitment and releases active capacity.
It never means money was returned. All `PAYMENT_RECORDED`, `PAYMENT_REVERSED` and
`REFUND_RECORDED` history is preserved. After cancellation, new payments are denied,
while existing valid payments may still be resolved via refund or (where lineage
permits) reversal. `net_paid_minor > 0` on a cancelled order is an unresolved
financial obligation, not an inconsistent ledger.

## Ledger freeze

`financial_facts` is append-only (no direct client INSERT/UPDATE/DELETE, no cleanup RPC).

- `PAYMENT_RECORDED`: manual, externally verified money. COBS did not process it.
- `PAYMENT_REVERSED`: full original amount, once, never on a refunded payment.
- `REFUND_RECORDED`: references exactly one `PAYMENT_RECORDED`; partial and multiple
  allowed; never exceeds the referenced payment or the order's valid paid amount;
  never references a reversed payment.

## Price freeze

Price history is immutable once used. One active non-overlapping window per
sellable + currency, intervals `[valid_from, valid_until)`. Exact-touch windows are
allowed; overlaps are rejected. Order items permanently snapshot the agreed price.

## Boundary freeze

- Purchase does NOT create W03 participation. Reservation != participation.
  `beneficiary_person_id` is commercial metadata only, and requires `quantity = 1`.
- No payment gateway, Pix API, Stripe, Mercado Pago, Pagar.me, Asaas, Adyen, PayPal,
  card processing, payment webhook, provider settlement, or fake provider state exists
  anywhere in W09.

## Frontend surface

- `/commerce` — commerce dashboard, order list with status filter and derived
  outstanding/overpaid, order creation.
- `/commerce/$orderId` — order detail: draft-only item builder, frozen price
  snapshots, totals, commercial reservations with effective state and hold release,
  derived financial state, manual payment recording, payment reversal, refund,
  append-only fact stream.
- `/settings/catalog` — sellables and non-overlapping price windows.
- pt-BR / en-US / es-ES. Mobile shell unchanged: 3 primary destinations + "Mais".
- Payment CTA reads "Registrar pagamento verificado" (record verified payment).
  No "Pagar", "Cobrar", "Processar pagamento" or any wording implying COBS moves money.

## Data state

Database contains zero application rows: all W01–W09 public tables are at 0, and the
W09VER verification tenants, people, memberships and auth accounts were removed in a
single privileged maintenance transaction. Disabled triggers after commit: 0. No
cleanup RPC, maintenance route, admin backdoor, or ledger-rewrite capability remains.

## Known limitation

Authenticated browser UX of the W09 commerce surface and a live realtime websocket
round-trip on `financial_facts` were NOT executed. Publication inspection is not a
live socket test. Status: **UNVERIFIED** (never to be reported as PASS).
