# Security invariants

1. Browser never receives n8n/OpenAI/callback secrets.
2. Browser never inserts directly into automation outbox.
3. Operation and tenant authorization is enforced server-side/RLS.
4. Portal UI remains separate from operator AppShell.
5. Assistant reply is persisted only after the existing validated callback/result contract.
