# COBS Assistant Conversations — Portal V1

Status: feature branch / pre-merge QA.

## Scope

Traveler-only assistant surface at `/my/$operationId/assistant`.

The UI does not call n8n or OpenAI directly. It uses the authenticated Supabase session and the Assistant Conversations database contract:

1. Resolve or create an active conversation for the current operation.
2. Read only conversation/message rows allowed by RLS.
3. Submit user text through `assistant_submit_message`.
4. Backend emits `assistant.request` into the existing automation outbox.
5. Existing dispatcher + Assistant Router process the request.
6. Callback persists `automation_results`; backend trigger appends the assistant response to the conversation history.
7. UI polls while a user message is pending and then falls back to a low-frequency refresh.

## Security boundaries

- Portal remains isolated from operator/admin navigation.
- No OpenAI or n8n secret is present in the browser.
- No direct browser write to `automation_events`.
- Conversation and message reads remain protected by Supabase RLS.
- The assistant must not invent operational facts; the existing Router contract remains unchanged.

## Files

- `src/lib/assistant-conversations.ts`
- `src/routes/_authenticated/my.$operationId.assistant.tsx`
- `src/app/portal/portal-shell.tsx`

## Release gate

Do not merge until typecheck/build/route generation and authenticated traveler QA pass. Test with a pure traveler account as well as an operator account. Confirm that `/my/$operationId/assistant` cannot expose another operation/tenant conversation.
