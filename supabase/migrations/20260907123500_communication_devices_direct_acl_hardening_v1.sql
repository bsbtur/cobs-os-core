-- COBS OS · Communication devices direct ACL hardening v1
-- Restores the original W07B security boundary: push-token material is server-private.
-- Client roles must use the approved RPC surface; no direct table access is required.

revoke all on table public.communication_devices from public, anon, authenticated;

-- Preserve the backend/server path explicitly.
grant all on table public.communication_devices to service_role;
