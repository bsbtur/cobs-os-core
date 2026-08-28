create or replace function public.reorder_playbook_items(_journey_step_id uuid, _playbook_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _step public.journey_steps;
  _expected_count int;
  _provided_count int;
  _distinct_count int;
  _id uuid;
  _seq int := 10;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into _step from public.journey_steps where id = _journey_step_id;
  if _step.id is null then raise exception 'Journey step not found'; end if;

  if not app_private.has_tenant_role(_step.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission for this operation runtime';
  end if;

  if _playbook_item_ids is null then raise exception 'Checklist order is required'; end if;

  select count(*) into _expected_count
  from public.playbook_items
  where journey_step_id = _step.id and is_active = true;

  _provided_count := coalesce(array_length(_playbook_item_ids, 1), 0);
  select count(distinct x) into _distinct_count from unnest(_playbook_item_ids) as x;

  if _provided_count <> _expected_count or _distinct_count <> _expected_count then
    raise exception 'Checklist order must contain every active item exactly once';
  end if;

  if exists (
    select 1
    from unnest(_playbook_item_ids) as x(id)
    left join public.playbook_items i on i.id = x.id
    where i.id is null
       or i.journey_step_id <> _step.id
       or i.operation_id <> _step.operation_id
       or i.tenant_id <> _step.tenant_id
       or i.is_active <> true
  ) then
    raise exception 'Checklist order contains an invalid item';
  end if;

  perform set_config('app.w04_control','on',true);
  foreach _id in array _playbook_item_ids loop
    update public.playbook_items
      set sequence = _seq,
          updated_at = now()
      where id = _id;
    _seq := _seq + 10;
  end loop;
  perform set_config('app.w04_control','off',true);

  perform app_private.record_audit_event(
    _step.tenant_id,
    auth.uid(),
    'playbook.items_reordered',
    'journey_step',
    _step.id,
    null,
    jsonb_build_object('operation_id', _step.operation_id, 'item_ids', to_jsonb(_playbook_item_ids))
  );

  return jsonb_build_object('journey_step_id', _step.id, 'item_count', _expected_count);
end
$function$;

revoke all on function public.reorder_playbook_items(uuid, uuid[]) from public;
grant execute on function public.reorder_playbook_items(uuid, uuid[]) to authenticated, service_role;
