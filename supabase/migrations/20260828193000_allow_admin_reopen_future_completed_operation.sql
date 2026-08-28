create or replace function public.reopen_operation(
  _operation_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _op public.operations;
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
begin
  if _uid is null then
    raise exception 'Authentication required';
  end if;

  select * into _op
  from public.operations o
  where o.id = _operation_id
  for update;

  if _op.id is null then
    raise exception 'Operation not found';
  end if;

  if not app_private.has_tenant_role(
    _op.tenant_id,
    array['owner','admin']::public.app_role[]
  ) then
    raise exception 'Only owners and admins can reopen an operation';
  end if;

  if _op.status <> 'completed' then
    raise exception 'Only completed operations can be reopened';
  end if;

  if _op.planned_start <= now() then
    raise exception 'Only future operations can be reopened';
  end if;

  if _reason_clean is null or length(_reason_clean) < 3 then
    raise exception 'A reason is required to reopen an operation';
  end if;

  perform set_config('app.op_control', 'on', true);
  update public.operations
  set status = 'planning',
      completed_at = null,
      updated_at = now()
  where id = _op.id;
  perform set_config('app.op_control', 'off', true);

  perform app_private.record_audit_event(
    _op.tenant_id,
    _uid,
    'operation.reopened',
    'operation',
    _op.id,
    null,
    jsonb_build_object(
      'from_status', _op.status,
      'to_status', 'planning',
      'reason', _reason_clean,
      'planned_start', _op.planned_start,
      'planned_end', _op.planned_end
    )
  );

  return jsonb_build_object(
    'operation_id', _op.id,
    'status', 'planning',
    'reopened', true
  );
end;
$function$;

revoke all on function public.reopen_operation(uuid, text) from public;
grant execute on function public.reopen_operation(uuid, text) to authenticated;
