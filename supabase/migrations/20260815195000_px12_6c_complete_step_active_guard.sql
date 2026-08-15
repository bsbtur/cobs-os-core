create or replace function public.complete_journey_step(
  _journey_step_id uuid,
  _occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _step public.journey_steps;
  _op public.operations;
  _id uuid;
  _readiness jsonb;
begin
  _step := app_private.w04_step(
    _journey_step_id,
    array['owner','admin','operations_agent']
  );

  select * into _op
  from public.operations o
  where o.id = _step.operation_id;

  if _op.status <> 'active' then
    raise exception 'A journey step can only be completed while the operation is running';
  end if;

  if not app_private.w04_has_event(_step.id, 'STEP_STARTED') then
    raise exception 'This step has not started yet';
  end if;

  if app_private.w04_has_event(_step.id, 'STEP_COMPLETED') then
    return jsonb_build_object(
      'journey_step_id', _step.id,
      'unchanged', true
    );
  end if;

  if _step.step_kind in ('movement','return','disembarkation')
     and not app_private.w04_has_event(_step.id, 'ARRIVED') then
    raise exception 'The group has not arrived for this step yet';
  end if;

  _readiness := public.w04_step_readiness(_step.id);

  if not coalesce((_readiness->>'ready')::boolean, false) then
    raise exception 'This step is not ready to be completed. Resolve required presence and checklist items first.';
  end if;

  _id := app_private.record_journey_event(
    _op,
    _step.id,
    'STEP_COMPLETED',
    _occurred_at
  );

  return jsonb_build_object(
    'journey_step_id', _step.id,
    'journey_event_id', _id,
    'readiness', _readiness
  );
end;
$function$;
