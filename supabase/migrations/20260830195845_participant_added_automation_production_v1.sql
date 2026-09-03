create or replace function app_private.enqueue_participant_added_automation_event()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
begin
  insert into public.automation_events (
    tenant_id, operation_id, actor_profile_id, event_type, source,
    idempotency_key, correlation_id, payload
  )
  values (
    new.tenant_id,
    new.operation_id,
    new.created_by,
    'participant.added',
    'cobs_db',
    'participant.added:' || new.id::text,
    gen_random_uuid()::text,
    jsonb_build_object(
      'participation_id', new.id,
      'operation_id', new.operation_id,
      'person_id', new.person_id,
      'participation_kind', new.participation_kind::text,
      'status', new.status::text,
      'created_at', new.created_at
    )
  )
  on conflict (tenant_id, source, idempotency_key) do nothing;
  return new;
end;
$$;

revoke all on function app_private.enqueue_participant_added_automation_event() from public, anon, authenticated, service_role;
grant execute on function app_private.enqueue_participant_added_automation_event() to postgres;

drop trigger if exists operation_participations_enqueue_participant_added_automation_e on public.operation_participations;
create trigger operation_participations_enqueue_participant_added_automation_e
after insert on public.operation_participations
for each row execute function app_private.enqueue_participant_added_automation_event();

create or replace function public.claim_automation_outbox(_limit integer default 10)
returns setof public.automation_events
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _safe_limit integer := greatest(1, least(coalesce(_limit, 10), 50));
begin
  return query
  with candidates as (
    select e.id
    from public.automation_events e
    where e.source = 'cobs_db'
      and e.event_type in ('order.confirmed','participant.added')
      and e.dispatch_status in ('pending','failed')
      and e.dispatch_attempts < 3
    order by e.created_at asc
    for update skip locked
    limit _safe_limit
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

revoke all on function public.claim_automation_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_automation_outbox(integer) to postgres, service_role;