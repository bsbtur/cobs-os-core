-- DEF-PILOT-023 / DEF-PILOT-025 — backend invariant only.
-- Movement-like steps (movement, return) and disembarkation cannot be completed
-- without an ARRIVED milestone on the same step. Append-only history untouched:
-- the invalid command is rejected, nothing is updated or deleted.
CREATE OR REPLACE FUNCTION public.complete_journey_step(_journey_step_id uuid, _occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _step public.journey_steps; _op public.operations; _id uuid;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  if not app_private.w04_has_event(_step.id, 'STEP_STARTED') then
    raise exception 'This step has not started yet';
  end if;
  if app_private.w04_has_event(_step.id, 'STEP_COMPLETED') then
    return jsonb_build_object('journey_step_id', _step.id, 'unchanged', true);
  end if;
  -- DEF-PILOT-023: the arrival fact is mandatory before closing a step whose
  -- semantics are "the group moves and gets somewhere".
  if _step.step_kind in ('movement','return','disembarkation')
     and not app_private.w04_has_event(_step.id, 'ARRIVED') then
    raise exception 'The group has not arrived for this step yet';
  end if;
  _id := app_private.record_journey_event(_op, _step.id, 'STEP_COMPLETED', _occurred_at);
  -- The operation is NOT auto-completed; W02 completion stays human-authorized.
  return jsonb_build_object('journey_step_id', _step.id, 'journey_event_id', _id);
end;
$function$;