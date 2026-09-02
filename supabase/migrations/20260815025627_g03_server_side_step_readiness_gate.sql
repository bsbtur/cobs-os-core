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
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;

  if not app_private.w04_has_event(_step.id, 'STEP_STARTED') then
    raise exception 'This step has not started yet';
  end if;

  if app_private.w04_has_event(_step.id, 'STEP_COMPLETED') then
    return jsonb_build_object('journey_step_id', _step.id, 'unchanged', true);
  end if;

  -- Arrival is a separate operational invariant for movement-like steps.
  if _step.step_kind in ('movement','return','disembarkation')
     and not app_private.w04_has_event(_step.id, 'ARRIVED') then
    raise exception 'The group has not arrived for this step yet';
  end if;

  -- G03: server-side completion gate. The frontend readiness indicator is not
  -- authoritative; every caller (web, mobile, automation or direct RPC) must
  -- satisfy the same presence and required-checklist invariants.
  _readiness := public.w04_step_readiness(_step.id);
  if not coalesce((_readiness->>'ready')::boolean, false) then
    raise exception 'This step is not ready to be completed. Resolve required presence and checklist items first.';
  end if;

  _id := app_private.record_journey_event(_op, _step.id, 'STEP_COMPLETED', _occurred_at);

  -- Operation completion remains a separate, human-authorized lifecycle action.
  return jsonb_build_object(
    'journey_step_id', _step.id,
    'journey_event_id', _id,
    'readiness', _readiness
  );
end;
$function$;