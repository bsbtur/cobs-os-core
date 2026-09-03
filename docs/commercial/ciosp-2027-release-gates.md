# CIOSP 2027 — Commercial release gates

Scope: **COBS OS — COMERCIAL / CLIENTE**.

Status recorded on 2026-09-02. This document records evidence and release blockers; it does not authorize public sales.

## Golden Path

| Gate | Status | Evidence / condition |
| --- | --- | --- |
| Public landing route | PASS | `/ciosp-2027` exists and preview/build validation passed. |
| Lead capture backend | PASS | Controlled QA call to `ciosp-public-lead-capture` returned HTTP 201 and created a lead linked to canonical operation `CIOSP-SP-2027`. |
| `lead.created` event | PASS | Event `2239bac3-8563-46be-9b5e-cf4f4bec4d06` was created. |
| n8n dispatch | **P0 FAIL** | Current event failed with `n8n_http_403`. Tracked in #119. |
| Automation result/callback | BLOCKED | Require n8n dispatch PASS first, then exactly one `automation_results` record. |
| Public sales | CLOSED | Canonical sellable remains `sales_public=false`; do not open as part of QA. |
| Checkout/Pix | QA ONLY | Existing protected QA path must remain authenticated/authorized while sales are closed. |
| Traveler handoff | NOT YET RELEASE-GATED | Validate only after trustworthy payment/reservation confirmation; traveler UI belongs to its own front. |

## Commercial-data integrity

The canonical offering currently confirms the basic commercial structure (offering, capacity, BRL and planning metadata), but the public route contains detailed package inclusion claims that are not backed by a canonical package-component source.

Tracked in #121. Until an approved source exists, public pre-launch copy must not promise specific hotel nights, flights, transfers, insurance, registration or other package components.

## Privacy / consent gap

The lead form captures name, email, phone and explicit contact consent. A repository search on 2026-09-02 did not locate a reusable public Privacy Policy / Terms route or document.

Before a public commercial launch, provide a customer-visible privacy notice/policy appropriate to the data capture and link it from the form. This is a launch requirement, not permission to invent legal text or silently change shared governance.

## Release rule

Do **not** mark the commercial Golden Path PASS and do **not** open public sales until:

1. #119 is resolved and a fresh controlled lead proves `dispatch_status=completed` plus one automation result;
2. #121 is resolved or the detailed package composition is supported by an approved authoritative source;
3. the public lead form has an approved privacy notice/policy path;
4. the current branch is compatible with current `main`, Quality Gate is green, and preview is validated.
