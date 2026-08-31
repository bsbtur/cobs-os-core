# Assistant Conversations — deployed production contract

Captured after successful E2E validation on 2026-08-31.

Production Supabase contains a separate Assistant Conversations foundation with:

- `assistant_conversations`
- `assistant_conversation_messages`
- `assistant_create_conversation(...)`
- `assistant_submit_message(...)`
- RLS supporting authorized operators and the authenticated traveler with an active participant access grant
- automatic `assistant.request` outbox emission with source `cobs_app`
- automation result bridge that appends the validated assistant reply to conversation history

Validated path:

`conversation -> user message -> assistant.request -> dispatcher -> n8n Assistant Router -> OpenAI -> callback -> automation_results -> assistant message`

The existing Assistant Router workflow is already E2E validated and must not be structurally changed by the portal feature.

Important: repository automation-gateway/dispatcher sources may lag deployed Supabase versions. Never replace the deployed production functions from stale repository code merely to make repository state look complete. Sync them separately after comparing the actual deployed contract.
