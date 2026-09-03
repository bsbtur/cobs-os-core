create or replace function public.set_operation_status(_operation_id uuid, _status public.operation_status, _reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _op public.operations;
  _allowed boolean := false;
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
  _evidence jsonb;
  _pending_steps jsonb := '[]'::jsonb;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _op from public.operations o where o.id = _operation_id for update;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this operation';
  end if;
  if _op.status = _status then
    return jsonb_build_object('operation_id', _op.id, 'status', _op.status, 'unchanged', true);
  end if;

  if _op.status in ('completed', 'cancelled') then
    raise exception 'A % operation cannot change status', _op.status;
  end if;

  _allowed := case _op.status
    when 'draft'    then _status in ('planning', 'cancelled')
    when 'planning' then _status in ('draft', 'ready', 'cancelled')
    when 'ready'    then _status in ('planning', 'active', 'cancelled')
    when 'active'   then _status in ('completed', 'cancelled')
    else false
  end;
  if not _allowed then
    raise exception 'Transition from % to % is not allowed', _op.status, _status;
  end if;
  if _status = 'completed' and not app_private.has_tenant_role(_op.tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins can complete an operation';
  end if;
  if _status = 'cancelled' and _reason_clean is null then
    raise exception 'A reason is required to cancel an operation';
  end if;

  if _status = 'completed' then
    _evidence := app_private.w02_runtime_evidence(_op.id, null);
    if coalesce((_evidence->>'total')::int, 0) = 0 then
      raise exception 'This operation cannot be closed because nothing was executed yet. Record the real journey, presence or transport facts first, or cancel the operation.';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object('step_id', s.id, 'sequence', s.sequence, 'title', s.title)
        order by s.sequence
      ),
      '[]'::jsonb
    )
    into _pending_steps
    from public.journey_steps s
    where s.operation_id = _op.id
      and s.tenant_id = _op.tenant_id
      and s.archived_at is null
      and not exists (
        select 1
        from public.journey_events e
        where e.operation_id = _op.id
          and e.tenant_id = _op.tenant_id
          and e.journey_step_id = s.id
          and e.event_type in ('STEP_COMPLETED','STEP_SKIPPED')
      );

    if jsonb_array_length(_pending_steps) > 0 then
      raise exception 'This operation cannot be closed because % journey step(s) are still pending', jsonb_array_length(_pending_steps);
    end if;
  end if;

  perform set_config('app.op_control', 'on', true);
  update public.operations set
    status = _status,
    completed_at = case when _status = 'completed' then now() else completed_at end,
    cancelled_at = case when _status = 'cancelled' then now() else cancelled_at end,
    cancellation_reason = case when _status = 'cancelled' then _reason_clean else cancellation_reason end
  where id = _op.id;
  perform set_config('app.op_control', 'off', true);

  perform app_private.record_audit_event(
    _op.tenant_id, _uid,
    case _status when 'completed' then 'operation.completed'
                 when 'cancelled' then 'operation.cancelled'
                 else 'operation.status_changed' end,
    'operation', _op.id, null,
    jsonb_build_object('from_status', _op.status, 'to_status', _status, 'reason', _reason_clean,
                       'runtime_evidence', _evidence, 'pending_journey_steps', _pending_steps)
  );

  return jsonb_build_object('operation_id', _op.id, 'status', _status);
end;
$function$;