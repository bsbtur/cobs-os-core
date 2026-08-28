create or replace function public.record_departed(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _step public.journey_steps;
  _authorized boolean := false;
  _prior_authorized boolean := false;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);

  select app_private.w04_has_event(_step.id,'DEPARTURE_AUTHORIZED') into _authorized;

  if not _authorized and _step.step_kind in ('movement','return') then
    select exists(
      select 1
      from public.journey_steps prior
      join public.journey_events e
        on e.journey_step_id = prior.id
       and e.event_type = 'DEPARTURE_AUTHORIZED'
      where prior.operation_id = _step.operation_id
        and prior.sequence < _step.sequence
        and prior.archived_at is null
    ) into _prior_authorized;
  end if;

  if not (_authorized or _prior_authorized) then
    raise exception 'Departure has not been authorized for this step';
  end if;

  return app_private.w04_milestone(_journey_step_id,'DEPARTED',_occurred_at);
end;
$function$;

grant execute on function public.record_departed(uuid,timestamptz) to authenticated;
revoke execute on function public.record_departed(uuid,timestamptz) from anon, public;

create or replace function public.complete_disembarkation(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
begin
  if not app_private.w04_has_event(_journey_step_id,'ARRIVED') then
    raise exception 'The group has not arrived for this step';
  end if;
  return app_private.w04_milestone(_journey_step_id,'DISEMBARKATION_COMPLETED',_occurred_at);
end;
$function$;

grant execute on function public.complete_disembarkation(uuid,timestamptz) to authenticated;
revoke execute on function public.complete_disembarkation(uuid,timestamptz) from anon, public;
