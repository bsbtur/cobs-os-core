# COBS Assistant Conversations — Portal V1

Status: feature branch / pre-merge QA.

## Scope

Traveler-only text assistant at `/my/$operationId/assistant` using the already validated Assistant Conversations backend.

Flow:

`traveler -> assistant_submit_message -> assistant.request -> dispatcher -> n8n Assistant Router -> callback -> automation_results -> conversation history`

## Security invariants

- Browser never receives n8n/OpenAI/callback secrets.
- Browser never writes directly to `automation_events`.
- Database RLS/RPC checks remain authoritative for tenant/operation access.
- Router prompt/model/callback contract are not changed by this feature.
- Internal automation ids and provider metadata are not mapped into traveler UI.

## Release gate

Before merge: build/type/route generation, pure-traveler E2E, cross-operation/cross-tenant denial QA and mobile usability QA.
