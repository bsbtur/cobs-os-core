-- COBS OS · automation outbox stale-processing recovery
-- Reclaims events left in processing when a dispatcher crashes after claiming
-- them but before recording dispatched/failed. Recovery remains bounded by
-- the existing 3-attempt cap.

create or replace function public.claim_automation_outbox(_limit integer default 10)
returns setof public.automation_events
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _limit integer := greatest(1, least(coalesce(_limit, 10), 50));
begin
  return query
  with candidates as (
    select e.id
      from public.automation_events e
     where e.source = 'cobs_db'
       and e.event_type = 'order.confirmed'
       and e.dispatch_attempts < 3
       and (
         e.dispatch_status in ('pending', 'failed')
         or (
           e.dispatch_status = 'processing'
           and e.updated_at < now() - interval '5 minutes'
         )
       )
     order by e.created_at asc
     for update skip locked
     limit _limit
  )
  update public.automation_events e
     set dispatch_status = 'processing',
         dispatch_attempts = e.dispatch_attempts + 1,
         last_error_code = null,
         last_error_message = null
    from candidates c
   where e.id = c.id
  returning e.*;
end;
$$;

revoke all on function public.claim_automation_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.claim_automation_outbox(integer)
  to service_role;

comment on function public.claim_automation_outbox(integer) is
  'Atomically claims pending/failed COBS DB automation events and recovers stale processing rows older than 5 minutes, bounded to 3 total attempts.';
