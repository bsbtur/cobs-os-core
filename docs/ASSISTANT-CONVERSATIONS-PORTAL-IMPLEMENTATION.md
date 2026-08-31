# Implementation checkpoint

Branch: `feat/assistant-conversations-portal-v1`

Implemented:

- traveler assistant client contract with explicit view models
- active conversation resolve/create
- RLS-protected conversation history query
- message submit via `assistant_submit_message`
- polling while response is pending
- mobile-first assistant conversation screen
- assistant entry in traveler-only PortalShell navigation
- no direct n8n/OpenAI/browser outbox integration

Not yet approved for merge:

- generated route/type build validation
- pure traveler browser QA
- cross-tenant negative QA

The branch must remain isolated until the release gate is complete.
