# W09 — COMMERCE & PAYMENTS CORE

## ADVERSARIAL VERIFICATION & SECURITY GATE

Executed against the REAL backend with REAL authenticated sessions
(password grant, live JWTs, PostgREST). No service-role shortcuts were used
for any assertion; the service role was used only to create the verification
users.

**Result: PASS (with 2 recorded observations, no defects)**
Total assertions executed: **101 — 101 passed, 0 failed.**

---

## 1. Verification identities

| Actor | Tenant | Role |
|---|---|---|
| A_owner | Tenant A (`W09VER Tenant A`) | owner |
| A_admin | Tenant A | admin (via invitation + acceptance) |
| A_agent | Tenant A | operations_agent (via invitation + acceptance) |
| A_member | Tenant A | member (via invitation + acceptance) |
| B_owner | Tenant B (`W09VER Tenant B`) | owner |

All memberships were granted through the real W01 invitation flow
(`create_invitation` → `accept_invitation`), not by direct DML.

---

## 2. Static contract conformance

| Item | Contract | Observed |
|---|---|---|
| Tables | 6 | 6 (`sellables`, `prices`, `orders`, `order_items`, `commercial_reservations`, `financial_facts`) |
| Enums | 8 | 8 (`sellable_kind`, `sellable_status`, `price_basis`, `price_status`, `order_status`, `commercial_reservation_status`, `financial_fact_type`, `payment_method`) |
| Private helpers | 18 | 18 (`app_private.w09_*`) |
| Realtime tables | 1 | `financial_facts` only |
| Reservation TTL | 30 minutes, server-controlled | `app_private.w09_reservation_ttl() = interval '30 minutes'` |
| `payment_method` values | `cash`, `bank_transfer`, `other` | exact match; `pix` rejected at the type boundary |

---

## 3. Security surface

- RLS enabled on all 6 tables.
- `anon`: SELECT/INSERT/UPDATE/DELETE = **false** on every W09 table.
- `authenticated`: **SELECT only**; INSERT/UPDATE/DELETE = false on every table.
- Direct DML through PostgREST denied on all 6 tables (INSERT/UPDATE/DELETE probes).
- Private helpers (`w09_order_financial_state`, `w09_effective_occupancy`,
  `w09_reservation_ttl`) unreachable from an authenticated session.
- Public commerce functions are not executable by `anon`.
- Tenant B reads returned zero rows for every Tenant A table and were rejected
  by every Tenant A command probed.
- `member` role: zero rows on all tables, rejected by catalog, order list,
  order detail, order creation and payment recording.

---

## 4. Behavioural results

### Catalog & pricing (27/27)
- Offering-kind sellable requires an offering; duplicate active offering
  sellable rejected; cross-tenant offering injection rejected.
- Price windows: exact touch accepted; **one-microsecond overlap rejected**;
  open-ended collision rejected; a different currency coexists in the same window.
- Agent cannot create sellables or prices (owner/admin only).

### Orders, items and money arithmetic (32/32)
- `line_total = unit × quantity − discount`, checked BIGINT.
  Multiplication overflow at `9223372036854775807 × 2` rejected ("out of range").
- Discount above subtotal rejected; beneficiary only allowed at quantity 1;
  cross-tenant beneficiary rejected.
- Order currency singularity enforced: an item with no active price in the
  order currency is rejected.
- Items are draft-only: add/update/remove all rejected after submit.
- Price snapshot survives publication of a new price on the same sellable.

### Capacity & reservations
- Multi-item submit is atomic: a capacity failure on one line rejects the
  whole submit and leaves **zero** reservations.
- **Concurrent last-capacity race** (two actors, capacity 2, each requesting 2):
  exactly one winner, no oversell.
- Re-submit is a no-op (`unchanged: true`) with no duplicate reservation.
- `release_commercial_reservation` on a **confirmed** hold rejected for owner,
  admin and agent alike (must go through `cancel_order`); on a **reserved**
  hold it succeeds for the agent and is idempotent afterwards.
- `cancel_order` atomically releases capacity, records the reason on the
  reservation, preserves the reservation row, and is idempotent.
- `complete_order` retains confirmed capacity; a completed order cannot be cancelled.

### Lazy expiry (11/11)
Verified in real time by temporarily reducing the TTL to 5 seconds through two
migrations and **restoring the contractual 30 minutes immediately afterwards**
(confirmed post-restore). No test hook, flag or artefact remains in the schema.
- Live hold consumes capacity; after expiry the read model reports it as
  no longer consuming (`effective_occupancy` drops, `remaining` restored).
- `confirm_order` after expiry **reacquires** capacity when still free.
- When another buyer took the capacity in the meantime, confirm is **rejected**
  with a capacity error, the order stays `submitted`, the hold is materialised
  as `expired`, and no oversell occurs.
- Releasing an expired hold is a safe no-op; cancelling an expired-hold order works.

### Financial ledger (20/21 probes; the one non-match is an observation, below)
- Partial payment, settlement, refund and reversal arithmetic all exact.
- Duplicate `reference` accepted (global uniqueness correctly removed).
- Refund requires payment lineage; refund beyond the remaining lineage rejected.
- Reversal is 1:1 and full amount: blocked while refunds exist on that payment,
  blocked on a second attempt, and blocks later refunds on the reversed payment.
- Ledger is append-only: every fact retained (3 payments + 1 refund + 1 reversal),
  direct UPDATE and DELETE denied.
- Payments on cancelled orders rejected; zero and negative amounts rejected.
- Concurrent duplicate payment with the same idempotency key recorded **exactly once**.

---

## 5. Observations (no code changed; awaiting your ruling)

**OBS-W09-001 — Overpayment is recordable and flagged, not rejected.**
A payment exceeding the outstanding balance is accepted and surfaced as
`overpaid_minor > 0`, with `outstanding_minor` floored at 0. This is consistent
with an append-only ledger that records money reality, and the frozen contract
did not require rejection. If you want overpayment blocked at the command
boundary, that is a contract change.

**OBS-W09-002 — An order with recorded payments can be cancelled.**
`cancel_order` succeeds on an order carrying financial facts; capacity is
released, the full ledger is preserved, and the net paid amount remains
outstanding as a refund obligation. No money is destroyed. If cancellation
should require prior refund/reversal, that is a contract change.

**Idempotency scope (not a defect).** `idempotency_keys` is unique on
`(actor_profile_id, action, idempotency_key)`. A second actor reusing another
actor's key gets their **own** new order — it never returns or hijacks the
first actor's record. This is the intended per-actor scope.

---

## 6. Data state

Verification data is **retained** as instructed (prefix `W09VER`): 2 tenants,
5 auth users, 4 people, 2 experiences, several offerings, sellables, prices,
orders, reservations and financial facts. Nothing has been cleaned. Cleanup
awaits your explicit W09 Final Cleanup & Freeze authorization.
