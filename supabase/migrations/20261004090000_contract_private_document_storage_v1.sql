-- COBS OS · Private contract document storage v1
-- Creates the private bucket used by the reviewed contract PDF renderer.
-- This migration does not create contracts, activate templates/policies,
-- render documents, expose files publicly, or call any signature provider.

insert into storage.buckets (id, name, public)
values ('customer-contracts', 'customer-contracts', false)
on conflict (id) do update
set public = false;

-- Deliberately no storage.objects policies are created here.
-- Contract document reads/writes are performed only by guarded server-side
-- Edge Functions using the service role. Keeping the bucket without client
-- policies preserves fail-closed behavior for browser access.
