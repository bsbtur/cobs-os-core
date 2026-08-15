-- =====================================================================
-- COBS OS · PX12.4-B1 · Team Schedule least-privilege hardening
-- Authenticated users may read schedule facts; all writes remain RPC-only.
-- =====================================================================

revoke all on table public.operation_staff_assignments from authenticated;
revoke all on table public.staff_assignment_events from authenticated;

grant select on table public.operation_staff_assignments to authenticated;
grant select on table public.staff_assignment_events to authenticated;

-- Defensive: PUBLIC must not inherit table mutation privileges.
revoke all on table public.operation_staff_assignments from public;
revoke all on table public.staff_assignment_events from public;

-- Service role keeps operational ownership for platform maintenance.
grant all on table public.operation_staff_assignments to service_role;
grant all on table public.staff_assignment_events to service_role;
