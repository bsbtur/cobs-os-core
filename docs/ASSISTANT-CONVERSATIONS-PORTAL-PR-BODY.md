## What
Traveler-facing COBS Assistant conversation UI.

## Why
Expose the already validated Assistant Conversations + Router path inside `/my` without mixing it with operational notices or operator UI.

## Safety
Feature branch only; no secrets; no direct n8n/OpenAI calls; RLS/RPC remain authoritative; main unchanged.

## Gate
Build/type/route generation, pure traveler E2E, cross-tenant denial and mobile QA required before merge.
