create or replace function public.set_journey_visit_point_status(_visit_point_id uuid, _status text, _note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _point public.journey_visit_points;
  _step public.journey_steps;
  _op public.operations;
  _event_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into _point
    from public.journey_visit_points
    where id = _visit_point_id;

  if _point.id is null then
    raise exception 'Visit point not found';
  end if;

  if coalesce((_point.metadata ->> 'archived')::boolean, false) then
    raise exception 'Archived visit points cannot change runtime status';
  end if;

  _step := app_private.w04_step(
    _point.journey_step_id,
    array['owner','admin','operations_agent']
  );

  select * into _op from public.operations where id = _step.operation_id;
  if _op.status <> 'active' then
    raise exception 'Visit point status can only change while the operation is active';
  end if;

  _event_type := case lower(btrim(coalesce(_status, '')))
    when 'visited' then 'VISITED'
    when 'unavailable' then 'UNAVAILABLE'
    when 'ignored' then 'IGNORED'
    when 'available' then 'RESTORED'
    else null
  end;

  if _event_type is null then
    raise exception 'Invalid visit point status';
  end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note, '')), ''));

  insert into public.journey_visit_point_events (
    tenant_id,
    operation_id,
    journey_step_id,
    visit_point_id,
    event_type,
    note,
    actor_profile_id,
    occurred_at
  ) values (
    _point.tenant_id,
    _point.operation_id,
    _point.journey_step_id,
    _point.id,
    _event_type,
    nullif(btrim(coalesce(_note, '')), ''),
    auth.uid(),
    clock_timestamp()
  );

  perform app_private.record_audit_event(
    _point.tenant_id,
    auth.uid(),
    'journey.visit_point_status_changed',
    'journey_visit_point',
    _point.id,
    null,
    jsonb_build_object(
      'operation_id', _point.operation_id,
      'journey_step_id', _point.journey_step_id,
      'status', lower(btrim(_status))
    )
  );

  return jsonb_build_object(
    'visit_point_id', _point.id,
    'status', lower(btrim(_status))
  );
end;
$function$;

revoke all on function public.set_journey_visit_point_status(uuid,text,text) from public;
grant execute on function public.set_journey_visit_point_status(uuid,text,text) to authenticated;
