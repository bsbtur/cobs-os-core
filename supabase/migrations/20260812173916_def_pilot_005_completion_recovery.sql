-- =========================================================
-- DEF-PILOT-005 · R1 + R2 controlled amendment
-- =========================================================

-- ---------- shared private helper: runtime evidence census ----------
create or replace function app_private.w02_runtime_evidence(_operation_id uuid, _as_of timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  with cutoff as (select coalesce(_as_of, now()) as at),
  j as (
    select count(*)::int c from public.journey_events e, cutoff
    where e.operation_id = _operation_id
      and e.recorded_at < cutoff.at
      and e.event_type in ('STEP_STARTED','STEP_COMPLETED','GATHERING_STARTED','BOARDING_STARTED',
                           'BOARDING_COMPLETED','DEPARTURE_AUTHORIZED','DEPARTED','ARRIVED',
                           'DISEMBARKATION_COMPLETED')
  ),
  p as (
    select count(*)::int c from public.participant_presence_events e, cutoff
    where e.operation_id = _operation_id
      and e.recorded_at < cutoff.at
      and e.presence_fact in ('PRESENT_AT_MEETING_POINT','BOARDED','DISEMBARKED')
  ),
  t as (
    select count(*)::int c from public.transport_events e, cutoff
    where e.operation_id = _operation_id
      and e.recorded_at < cutoff.at
      and e.event_type in ('VEHICLE_EN_ROUTE_TO_PICKUP','VEHICLE_AT_PICKUP','LEG_DEPARTED',
                           'STOP_REACHED','DESTINATION_ARRIVED')
  ),
  v as (
    select count(*)::int c from public.event_runtime_events e, cutoff
    where e.operation_id = _operation_id
      and e.recorded_at < cutoff.at
      and e.event_type in ('EVENT_STARTED','EVENT_COMPLETED','SESSION_STARTED','SESSION_COMPLETED')
  )
  select jsonb_build_object(
    'journey', j.c, 'presence', p.c, 'transport', t.c, 'event_production', v.c,
    'total', j.c + p.c + t.c + v.c
  ) from j, p, t, v;
$$;

revoke all on function app_private.w02_runtime_evidence(uuid, timestamptz) from public;

-- ---------- R2: terminal completion guard inside set_operation_status ----------
create or replace function public.set_operation_status(_operation_id uuid, _status operation_status, _reason text default null::text)
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

  -- terminal states are final
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

  -- R2 (DEF-PILOT-005): completion requires real runtime evidence.
  if _status = 'completed' then
    _evidence := app_private.w02_runtime_evidence(_op.id, null);
    if coalesce((_evidence->>'total')::int, 0) = 0 then
      raise exception 'This operation cannot be closed because nothing was executed yet. Record the real journey, presence or transport facts first, or cancel the operation.';
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
                       'runtime_evidence', _evidence)
  );

  return jsonb_build_object('operation_id', _op.id, 'status', _status);
end;
$function$;

-- ---------- R1: narrow accidental-completion recovery ----------
create or replace function public.revoke_operation_completion(_operation_id uuid, _reason text, _idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _op public.operations;
  _why text := nullif(btrim(coalesce(_reason,'')),'');
  _existing jsonb;
  _result jsonb;
  _evidence_at_completion jsonb;
  _evidence_now jsonb;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _idempotency_key is null then raise exception 'An idempotency key is required'; end if;
  if _why is null then raise exception 'A reason is required to revoke an operation completion'; end if;
  perform app_private.assert_generic_note(_why);

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = _uid
      and k.action = 'operation.completion_revoke'
      and k.idempotency_key = _idempotency_key::text;
  if _existing is not null then return _existing; end if;

  select * into _op from public.operations o where o.id = _operation_id for update;
  -- Governance action: owner only. Generic message across tenants.
  if _op.id is null
     or not app_private.has_tenant_role(_op.tenant_id, array['owner']::public.app_role[]) then
    raise exception 'Operation not found';
  end if;

  if _op.status <> 'completed' then
    raise exception 'Only a completed operation can have its completion revoked';
  end if;

  -- Narrow scope: only ACCIDENTAL, pre-runtime completions are recoverable here.
  -- Legitimacy is judged by the evidence that existed at the moment of completion.
  _evidence_at_completion := app_private.w02_runtime_evidence(_op.id, _op.completed_at);
  _evidence_now := app_private.w02_runtime_evidence(_op.id, null);
  if coalesce((_evidence_at_completion->>'total')::int, 0) > 0 then
    raise exception 'This operation actually ran and cannot be reopened through the accidental-completion recovery path';
  end if;

  -- The frozen operations_completed_consistency invariant requires the completion
  -- stamp to exist only while status = 'completed'. The original completion evidence
  -- is therefore preserved immutably in audit_events, not on the mutable row.
  perform set_config('app.op_control', 'on', true);
  update public.operations
     set status = 'ready',
         completed_at = null
   where id = _op.id;
  perform set_config('app.op_control', 'off', true);

  perform app_private.record_audit_event(_op.tenant_id, _uid, 'operation.completion_revoked',
    'operation', _op.id, _idempotency_key::text,
    jsonb_build_object('from_status', 'completed', 'to_status', 'ready',
                       'reason', _why,
                       'original_completed_at', _op.completed_at,
                       'runtime_evidence_at_completion', _evidence_at_completion,
                       'runtime_evidence_now', _evidence_now,
                       'defect', 'DEF-PILOT-005'));

  _result := jsonb_build_object('operation_id', _op.id, 'status', 'ready',
                                'previous_status', 'completed',
                                'original_completed_at', _op.completed_at,
                                'runtime_evidence_at_completion', _evidence_at_completion,
                                'runtime_evidence_now', _evidence_now);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, _uid, 'operation.completion_revoke', _idempotency_key::text, _result);
  return _result;
end;
$function$;

revoke all on function public.revoke_operation_completion(uuid, text, uuid) from public;
grant execute on function public.revoke_operation_completion(uuid, text, uuid) to authenticated;
grant execute on function public.revoke_operation_completion(uuid, text, uuid) to service_role;