-- COBS OS · automation outbox claim
-- Claims a bounded batch atomically so concurrent dispatchers cannot send the
-- same pending event twice.

alter table public.automation_events
  drop constraint if exists automation_events_dispatch_status_check;

alter table public.automation_events
  add constraint automation_events_dispatch_status_check
  check (dispatch_status in ('pending', 'processing', 'dispatched', 'completed', 'failed'));

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
       and e.dispatch_status in ('pending', 'failed')
       and e.dispatch_attempts < 3
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
  'Atomically claims pending/failed COBS DB automation events for one dispatcher execution.';
