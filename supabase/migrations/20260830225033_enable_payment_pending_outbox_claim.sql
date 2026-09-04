create or replace function public.claim_automation_outbox(_limit integer default 10)
returns setof public.automation_events
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _safe_limit integer := greatest(1, least(coalesce(_limit, 10), 50));
begin
  return query
  with candidates as (
    select e.id
    from public.automation_events e
    where e.source='cobs_db'
      and e.event_type in ('order.confirmed','participant.added','payment.confirmed','payment.pending')
      and e.dispatch_status in ('pending','failed')
      and e.dispatch_attempts < 3
    order by e.created_at asc
    for update skip locked
    limit _safe_limit
  )
  update public.automation_events e
  set dispatch_status='processing',
      dispatch_attempts=e.dispatch_attempts+1,
      last_error_code=null,
      last_error_message=null
  from candidates c
  where e.id=c.id
  returning e.*;
end;
$function$;