# Assistant Conversations Portal V1 — QA gate

Before merge:

- [ ] `bun run build` passes and TanStack route tree includes `/my/$operationId/assistant`.
- [ ] TypeScript passes with the generated Supabase client types used by this branch.
- [ ] Pure traveler account with `0 memberships + active participant_access_grant` can open its operation assistant.
- [ ] Traveler cannot read another operation's or tenant's conversations/messages.
- [ ] Operator with valid tenant access can exercise the same flow for QA.
- [ ] Sending a message creates no browser-side write to `automation_events`; only `assistant_submit_message` is used.
- [ ] Pending user message becomes an assistant response through the existing dispatcher/router/callback path.
- [ ] Unknown/unconfirmed fact is not fabricated and follows Router handoff behavior.
- [ ] Portal navigation contains no `/app`, `/team`, `/settings` or `/commerce` destination.
- [ ] Mobile composer remains usable above the bottom navigation and respects safe-area inset.

Merge only after these checks are evidenced.
