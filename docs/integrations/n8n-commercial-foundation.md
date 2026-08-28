# COBS OS · n8n commercial foundation V1

Status: code foundation only. Do not point production traffic at this contract
until the migration, Edge Function, secrets, and n8n workflow pass staging QA.

The repository's current `supabase/config.toml` still references a legacy project.
Every staging CLI command must therefore pass the explicit project ref
`wzukfenbzwlwzhtadlxl`; do not run an implicit deploy or relink production.

## Ownership

- Postgres is the canonical source of tenant, operation, event, result, and audit truth.
- n8n orchestrates classification and delivery; it does not own business status.
- OpenAI classifies free text; it never confirms payments or mutates operations.

## Secrets

Configure only in Supabase Edge Function secrets and n8n Credentials:

- `N8N_COMMERCIAL_WEBHOOK_URL`
- `N8N_WEBHOOK_TOKEN` (COBS to n8n)
- `COBS_N8N_CALLBACK_TOKEN` (n8n to COBS)

Use independent random values with at least 32 bytes. Never expose them through
`VITE_*`, workflow JSON, screenshots, logs, or browser code.

## n8n workflow: COBS · Commercial Lead V1

Create one workflow with these nodes:

1. **Webhook** — `POST /cobs-commercial-lead-v1`; Header Auth validates
   `x-cobs-webhook-token` using an n8n credential.
2. **Code / Validate contract** — require `schema_version = 1`, UUID event and
   tenant IDs, `event_type = lead.created`, and an object payload.
3. **OpenAI / Message a model** — use the existing OpenAI credential and an
   economical model. Send only the lead's message and minimum commercial context.
4. **Structured output** — enforce exactly `intent`, `urgency`, `summary`, and
   `suggested_reply`, using the allowed values and size limits below.
5. **HTTP Request / Callback** — POST to
   `/functions/v1/automation-gateway?action=result`, with the credential-backed
   `x-n8n-callback-token` header.
6. **Respond to Webhook** — acknowledge accepted dispatch. Do not wait for a
   customer communication provider in this workflow.

Allowed output:

```json
{
  "intent": "price|installment|group|ready_to_buy|human_support|other",
  "urgency": "low|medium|high",
  "summary": "up to 500 characters",
  "suggested_reply": "up to 600 characters"
}
```

Callback body:

```json
{
  "event_id": "{{$json.id}}",
  "tenant_id": "{{$json.tenant_id}}",
  "outcome": "completed",
  "intent": "price",
  "urgency": "high",
  "summary": "Lead pediu o preço do CIOSP 2027.",
  "suggested_reply": "Olá! Vou apresentar as opções disponíveis.",
  "provider_metadata": {}
}
```

## Cost guardrails

- One production workflow execution per accepted lead.
- Duplicate idempotency keys return the existing event without calling n8n.
- Unsupported event types and oversized payloads are rejected before n8n.
- Keep model output below 600 characters and do not send full customer history.
- Configure n8n workflow concurrency at one during the pilot.
- Pause the workflow at 80% of its assigned monthly execution budget.

## Staging gate

Evidence required before Preview publication:

1. Migration applies to COBS OS STAGING V3.1.
2. Supabase advisors report no security or performance errors introduced.
3. Health endpoint rejects an absent/wrong token and accepts the configured token.
4. Authenticated tenant member can dispatch `lead.created`.
5. Non-member receives 403.
6. Duplicate key does not start a second n8n execution.
7. n8n returns a valid structured result.
8. Result and audit rows are tenant-scoped and visible only to authorized members.
9. `main`, production database, and V1 deployment remain unchanged.
