-- The staff alert generator is invoked only by the authenticated server-side cron route
-- using SUPABASE_SERVICE_ROLE_KEY. Client sessions must not execute it directly.

revoke execute on function public.generate_due_staff_journey_alerts(uuid, timestamptz, timestamptz)
  from authenticated;

grant execute on function public.generate_due_staff_journey_alerts(uuid, timestamptz, timestamptz)
  to service_role;
