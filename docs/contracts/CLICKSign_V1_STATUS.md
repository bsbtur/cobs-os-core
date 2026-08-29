# COBS OS — Customer Contracts / Clicksign V1

Status checkpoint for the CIOSP 2027 commercial Golden Path.

## Scope

Customer contract lifecycle integrated with Clicksign Sandbox, isolated from production.

## Implemented in STAGING

- `customer_contracts` and `contract_events` domain migration.
- Private Storage bucket `customer-contracts` for PDF documents.
- Contract lifecycle statuses: `draft`, `sent`, `viewed`, `signed`, `cancelled`, `expired`, `superseded`.
- Edge Function `contracts-clicksign-send` deployed in Supabase STAGING.
- Edge Function `contracts-clicksign-webhook` deployed in Supabase STAGING.

## Current release gate

The Edge Functions are deployed in STAGING but Clicksign E2E is **not validated yet**.

External secrets/configuration still required:

- `CLICKSIGN_ACCESS_TOKEN`
- `CLICKSIGN_BASE_URL=https://sandbox.clicksign.com/api/v3`
- `CLICKSIGN_WEBHOOK_SECRET`
- Clicksign Sandbox webhook URL: `https://wzukfenbzwlwzhtadlxl.supabase.co/functions/v1/contracts-clicksign-webhook`

Never commit secret values to GitHub or expose them in the frontend.

## Required E2E evidence

1. Create one fictitious QA customer contract.
2. Store its original PDF in the private bucket.
3. Send it through `contracts-clicksign-send`.
4. Confirm envelope activation in Clicksign Sandbox.
5. Open and sign as the QA signer.
6. Receive authenticated webhook events in COBS.
7. Confirm the contract reaches `signed` and audit events are persisted.
8. Download/archive the finalized signed PDF and persist `signed_document_path`.
9. Confirm tenant isolation/RLS and no residual QA data after cleanup.

## Definition of done

Do not mark Contracts V1 as E2E VALIDATED until all evidence above passes. Production remains out of scope until legal review, production credentials, webhook configuration, observability and release approval are complete.
