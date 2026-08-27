-- QA ONLY — V3.1-B B5.2 sandbox lifecycle compatibility adapter
-- Target used for the gate: COBS OS sandbox QA (mkjuoijrtbporbjkztla).
-- This file is intentionally outside supabase/migrations so it is not part of CLEAN BUILD rollout.

create or replace function app_private.finalize_operational_excellence_for_lifecycle(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  result jsonb;
begin
  result := public.evaluate_operational_excellence(p_operation_id, true);
  if result is null
     or nullif(result->>'snapshot_id', '') is null
     or result->>'status' <> 'final'
     or coalesce((result->>'frozen')::boolean, false) is not true then
    raise exception 'operational_excellence_finalization_failed';
  end if;
  return jsonb_build_object(
    'snapshot_id', result->'snapshot_id',
    'status', result->'status',
    'frozen', result->'frozen',
    'score', result->'score',
    'rounded_score', result->'rounded_score',
    'classification', result->'classification',
    'coverage_percent', result->'coverage_percent',
    'model', result->'model',
    'model_version', result->'model_version'
  );
end;
$$;

revoke all on function app_private.finalize_operational_excellence_for_lifecycle(uuid)
  from public, anon, authenticated;

create or replace function public.set_operation_status(
  _operation_id uuid,
  _status text,
  _reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  _uid uuid := auth.uid();
  _op public.operations;
  _operational_excellence jsonb;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _op from public.operations where id=_operation_id for update;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.is_tenant_member(_op.tenant_id) then raise exception 'forbidden'; end if;

  if _op.status = _status then
    if _status='completed' then
      select jsonb_build_object(
        'snapshot_id',s.id,
        'status',s.evaluation_status,
        'frozen',s.evaluation_status='final',
        'score',s.score,
        'rounded_score',s.rounded_score,
        'classification',s.classification,
        'coverage_percent',s.coverage_percent,
        'model',m.model_key,
        'model_version',m.version
      )
      into _operational_excellence
      from public.operational_excellence_snapshots s
      join public.operational_score_models m on m.id=s.model_id
      where s.operation_id=_op.id and s.evaluation_status='final'
      order by s.finalized_at desc nulls last, s.evaluated_at desc
      limit 1;
    end if;

    return jsonb_build_object(
      'operation_id',_op.id,
      'status',_op.status,
      'unchanged',true,
      'operational_excellence',_operational_excellence
    );
  end if;

  if _op.status <> 'active' or _status <> 'completed' then
    raise exception 'sandbox_b5_lifecycle_only_supports_active_to_completed';
  end if;

  update public.operations
  set status='completed', completed_at=now(), updated_at=now()
  where id=_op.id;

  -- Deliberately uncaught. Any evaluator failure must roll back the lifecycle UPDATE.
  _operational_excellence := app_private.finalize_operational_excellence_for_lifecycle(_op.id);

  perform app_private.record_audit_event(
    _op.tenant_id,_uid,'operation.completed','operation',_op.id,null,
    jsonb_build_object(
      'from_status',_op.status,
      'to_status','completed',
      'reason',nullif(btrim(coalesce(_reason,'')),''),
      'operational_excellence',_operational_excellence
    )
  );

  return jsonb_build_object(
    'operation_id',_op.id,
    'status','completed',
    'operational_excellence',_operational_excellence
  );
end;
$$;

revoke all on function public.set_operation_status(uuid,text,text) from public, anon;
grant execute on function public.set_operation_status(uuid,text,text) to authenticated;
