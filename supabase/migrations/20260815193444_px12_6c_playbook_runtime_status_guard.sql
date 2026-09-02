create or replace function app_private.w04_playbook_execute(
  _playbook_item_id uuid,
  _action public.playbook_execution_action,
  _note text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _row public.playbook_items;
  _op public.operations;
  _latest public.playbook_execution_action;
  _id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into _row
  from public.playbook_items i
  where i.id = _playbook_item_id;

  if _row.id is null then
    raise exception 'Checklist item not found';
  end if;

  if not app_private.has_tenant_role(
    _row.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then
    raise exception 'You do not have permission for this operation runtime';
  end if;

  select * into _op
  from public.operations o
  where o.id = _row.operation_id;

  if _op.status not in ('ready','active') then
    raise exception 'Checklist runtime can only be changed while the operation is ready or running';
  end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));

  select e.execution_action into _latest
  from public.playbook_executions e
  where e.playbook_item_id = _row.id
  order by e.recorded_at desc, e.id desc
  limit 1;

  if _latest is not distinct from _action then
    return jsonb_build_object(
      'playbook_item_id', _row.id,
      'state', _action,
      'unchanged', true
    );
  end if;

  perform set_config('app.w04_control','on', true);

  insert into public.playbook_executions (
    tenant_id,
    operation_id,
    playbook_item_id,
    journey_step_id,
    execution_action,
    actor_profile_id,
    occurred_at,
    note,
    correlation_id
  )
  values (
    _row.tenant_id,
    _row.operation_id,
    _row.id,
    _row.journey_step_id,
    _action,
    auth.uid(),
    now(),
    nullif(btrim(coalesce(_note,'')),''),
    gen_random_uuid()::text
  )
  returning id into _id;

  perform set_config('app.w04_control','off', true);

  return jsonb_build_object(
    'playbook_item_id', _row.id,
    'execution_id', _id,
    'state', _action
  );
end;
$function$;