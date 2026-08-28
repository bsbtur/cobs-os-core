# CIOSP 2027 — Commercial Release Gate

Status: STAGING E2E VALIDATED
Date: 2026-08-28
Branch: `feat/ciosp-commercial-golden-path`
Scope: minimum public commercial Golden Path only.

## Validated Golden Path

Public checkout -> Person -> W09 Order -> Order Item -> Submit -> Commercial Reservation -> Payment Charge -> Mercado Pago Pix -> Provider Approval/Reconciliation -> Financial Fact -> Order Confirmed -> Reservation Confirmed -> Operation Participation Confirmed.

## Final QA evidence

- Public order: `3c409df3-d4f4-458d-b20e-91dd29acad7b`
- Payment charge: `ab9ca01d-2b72-4f96-82f9-3473f8038cea`
- Payment attempt: `2def1696-4345-42fd-8713-0083be504d3d`
- Mercado Pago provider order: `ORDTST01M14NA1DHGD4JB0PB7JXKK728`
- Mercado Pago provider payment: `PAY01M14NA1DXKQJ607P0SPQ5CD6F`
- Provider final status: `processed / accredited`
- Paid amount: BRL 1.00
- Order final status: `confirmed`
- Reservation: `818462ed-bdbd-466e-97ee-822a336c9e22` -> `confirmed`
- Participation: `e019b8a3-dbe7-49d7-a0e1-32649c7b4ccf` -> `confirmed`

## Controls proved in QA

- Server-side price source; browser does not define amount.
- Reservation is created/protected before Pix creation.
- Expired reservation can be reacquired through existing W09 capacity logic.
- Mercado Pago Pix creation works in test environment.
- Payment reconciliation is idempotent.
- Provider-approved payment records financial fact before commercial confirmation.
- Paid order confirmation confirms reservation.
- Paid confirmed order materializes beneficiary as operation participant.
- Participation creation is idempotent and protected from duplication.

## Known implementation choice for release

The public checkout performs automatic polling/reconciliation while Pix is pending. This is the validated path for the current release candidate. Mercado Pago webhook hardening remains a post-release reliability improvement and is not required to prove the current customer Golden Path.

## Production blockers only

P0 — Provision production CIOSP commercial data: real operation/offering/sellable/price/capacity and final package rules.

P0 — Configure Mercado Pago production credentials/environment in the production Supabase project and validate account ownership/KYC requirements.

P0 — Deploy the validated commercial migrations/RPCs/Edge Functions and public checkout route to the intended production environment without changing the frozen V1 unexpectedly.

P0 — Run one controlled real-money production transaction with a low-risk test amount/product, verify provider settlement/reconciliation, order confirmation, reservation confirmation and participation creation, then reverse/refund if operationally appropriate.

P1 — Replace QA copy/labels and R$1.00 test presentation with the approved CIOSP commercial offer and customer-facing terms.

P1 — Confirm final public URL/domain and privacy/LGPD/terms links required for public sale.

## Scope freeze

Until the controlled production transaction passes, do not add marketplace, gamification, redesign, new payment methods, installment orchestration, CRM expansion, analytics dashboards or unrelated refactors.

Release rule: first production sale proof, then sophistication.
