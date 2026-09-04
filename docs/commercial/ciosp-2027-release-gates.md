# CIOSP 2027 — release gates

Updated 2026-09-04. This is a release ledger, not permission to open sales.

## Architecture review for this candidate

This branch reuses PR #149 and preserves the authenticated staff QA boundary instead of the unauthenticated preview bypass proposed in #148. No changes to RLS, auth providers, schema, historical migrations, commercial amounts or sales_public are included. A new service-backed status endpoint is limited to a valid checkout capability for reads, or the authenticated profile already linked to the buyer for renewal. Test-order renewal requires active staff membership in the order tenant. An e-mail address, Referer, UUID or replay key alone grants no access. The endpoint does not grant traveler access or link identities automatically.

New checkout orders persist an explicit payment environment and a copy of the accepted schedule. Legacy/unclassified orders fail closed in the new Pix path; they require an audited compatibility decision, not automatic relabeling. Payment mutations remain restricted to existing service-role paths. The frontend retains a short-lived checkout capability in tab-scoped sessionStorage, never a URL or log. Renewal requires authentication. Existing traveler invitation/profile linking remains a prerequisite after guest checkout.

## Evidence collected read-only

- Main observed: d5a0e22e2eb840b91ce7f046a9394ef9e4caa7e7; its Quality Gate passed.
- PR #149 head: 26d844387ec3c613ab690b1eac910bd3184f6317. This candidate builds on that commit without rewriting history.
- PR #148 failure: TS2379 because `headers: undefined` violates exactOptionalPropertyTypes. This candidate sends a headers object and does not import the preview bypass.
- Canonical database `nktohbqmcpgonlizzcka`, COBS OS CLEAN BUILD: healthy; migrations 20260904030335 and 20260904030353 installed; offering sales_public=false and approved four-item schedule observed.
- Repository supabase/config.toml points at a DIFFERENT project (`kkclthdpnwuamsndtxxq`). No CLI deployment may assume that target. Resolve project mapping explicitly before deployment; this branch does not silently change infrastructure configuration.
- Actual orders indexes do not include uniqueness on public_checkout_idempotency_key. Charges have unique (tenant_id, external_reference); attempts have unique (tenant_id,idempotency_key). Deterministic new charge/attempt references reduce same-obligation collisions, but do not make the whole checkout atomic.

## Implemented in candidate; not production evidence

- Explicit test/production environment, QA-order isolation and fail-closed legacy handling.
- Charge/attempt reuse rejects mismatched environments; payer resolved from buyer record.
- Accepted schedule copied into order metadata and read there by Pix/status; Brasília business-date calculations and allocation tests.
- Provider retry preserves its idempotency key after ambiguous failures; local payment/confirmation writes checked.
- Explicit QA header, authenticated staff checks even when the offering flag is true in test mode.
- Replay key alone cannot rotate a session or overwrite original commercial acceptance.
- Status polling, tab reload recovery and authenticated buyer-profile session renewal; same order used for later payments.
- Old landing QA form replaced by a link to the canonical checkout; public lead capture remains closed-sales behavior.
- ADMIN shortcut to existing Commerce rather than a second sales ledger/dashboard.

## Outstanding gates — do not mark the application ready

| Gate | Required evidence |
|---|---|
| Candidate validation | CI on final commit, browser/mobile QA and Deno checks for Edge Functions; root tsc does not cover functions |
| Atomic checkout / acceptance | Transactional creation, unique replay key and atomic persistence of environment/snapshot/acceptance; concurrent requests and crash recovery. Current post-RPC metadata write remains a gap |
| Concurrent obligations | Test actual simultaneous provider calls, changing amount across midnight, pending old QR, terminal/rejected attempts and partial DB failures. Deterministic keys alone are insufficient |
| Legacy compatibility | Classify historical orders/attempts/facts without mixing QA with real money; no blind metadata backfill |
| Frozen confirmation rules | Pix/status use the snapshot; existing confirm_paid_provider_order still reads offering entry_minor. Audit compatibility before future price changes |
| Provider environment | Verify deployed creator/webhook/reconciler agree on environment and do not ingest another environment's events |
| Customer access | Prove guest buyer → verified profile link/invitation → /my, including wrong-account and cross-tenant negatives; do not infer from participation materialization |
| Operational acceptance | Same paid test order in Commerce, confirmed reservation, passenger list, communication and QR/check-in according to existing rules |
| Offer and privacy | Approved inclusions/exclusions, specific support/cancellation channel, privacy coverage for contracting and versioned acceptance. Existing prelaunch notice is not sufficient evidence |
| Deployment | Resolve project-ID discrepancy, deploy exact SHA/functions to confirmed target; new ciosp-checkout-status requires gateway configuration permitting the app-level token/JWT checks |
| Live release | Authorized controlled payment, webhook/reconciliation, four obligations, capacity and rollback; no real payment or sales opening occurred here |

Do not retry a terminal Pix by silently creating an unrelated order. Preserve the order ID and use authorized recovery. A restored session is not proof of payment. A confirmed reservation is not full settlement.

## n8n and historical issues

Issue #119 records lead persistence and a manual follow-up fallback when n8n is quota-blocked. Automation is P1 while that fallback is workable; do not make lead storage depend on n8n. Issue #121 was completed by removing unapproved public claims, not by approving the package composition. PR #103 reconciled historical migration provenance; do not repeat it.

## Publication order

1. Approve the reviewed candidate and finish all P0 gates above.
2. Deploy only to the verified project, including the shared helper used by all three functions. Keep sales closed.
3. Validate authorized TEST data separately from real production data; preview frontend does not imply isolated database.
4. Define restricted live validation and rollback before opening sales. Do not remove authentication or rely on an undisclosed URL.
5. Only after explicit release authorization and complete evidence, open the canonical offering and public CTA. Stop new sales on failure without deleting orders or disabling reconciliation of payments already in flight.
