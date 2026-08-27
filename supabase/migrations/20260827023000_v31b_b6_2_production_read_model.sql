-- V3.1-B6.2 — Production Read Model & Authorization
-- Read-only product boundary for Operational Excellence.

create or replace function public.get_operation_excellence(_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_uid uuid := auth.uid();
  op record;
  snap record;
  model record;
  evidence jsonb;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select o.id, o.tenant_id, o.code, o.name, o.status
    into op
    from public.operations o
    join public.memberships m
      on m.tenant_id = o.tenant_id
     and m.profile_id = v_uid
   where o.id = _operation_id
   limit 1;

  if not found then
    raise exception 'operation_not_found_or_forbidden' using errcode = '42501';
  end if;

  if op.status <> 'completed' then
    return jsonb_build_object(
      'available', false,
      'reason', case when op.status = 'cancelled' then 'cancelled' else 'not_completed' end,
      'operation', jsonb_build_object(
        'id', op.id,
        'code', op.code,
        'name', op.name,
        'status', op.status
      )
    );
  end if;

  select s.*
    into snap
    from public.operational_excellence_snapshots s
   where s.operation_id = op.id
     and s.tenant_id = op.tenant_id
     and s.evaluation_status in ('final', 'insufficient_evidence')
   order by
     case when s.evaluation_status = 'final' then 0 else 1 end,
     s.finalized_at desc nulls last,
     s.evaluated_at desc
   limit 1;

  if not found then
    return jsonb_build_object(
      'available', false,
      'reason', 'evaluation_unavailable',
      'operation', jsonb_build_object(
        'id', op.id,
        'code', op.code,
        'name', op.name,
        'status', op.status
      )
    );
  end if;

  select m.id, m.model_key, m.version, m.weights, m.rules
    into model
    from public.operational_score_models m
   where m.id = snap.model_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'dimension_key', e.dimension_key,
      'rule_key', e.rule_key,
      'outcome', e.outcome,
      'points_awarded', e.points_awarded,
      'points_possible', e.points_possible,
      'source_type', e.source_type,
      'source_id', e.source_id,
      'evidence', e.evidence,
      'created_at', e.created_at
    ) order by e.dimension_key, e.rule_key), '[]'::jsonb)
    into evidence
    from public.operational_score_evidence e
   where e.snapshot_id = snap.id
     and e.tenant_id = op.tenant_id;

  return jsonb_build_object(
    'available', true,
    'operation', jsonb_build_object(
      'id', op.id,
      'code', op.code,
      'name', op.name,
      'status', op.status
    ),
    'snapshot', jsonb_build_object(
      'id', snap.id,
      'score', snap.score,
      'rounded_score', snap.rounded_score,
      'classification', snap.classification,
      'evaluation_status', snap.evaluation_status,
      'coverage_percent', snap.coverage_percent,
      'dimension_scores', snap.dimension_scores,
      'evaluated_at', snap.evaluated_at,
      'finalized_at', snap.finalized_at,
      'facts_fingerprint', snap.facts_fingerprint
    ),
    'model', jsonb_build_object(
      'model_key', model.model_key,
      'version', model.version,
      'weights', model.weights,
      'rules', model.rules
    ),
    'evidence', evidence
  );
end;
$$;

revoke all on function public.get_operation_excellence(uuid) from public;
revoke all on function public.get_operation_excellence(uuid) from anon;
grant execute on function public.get_operation_excellence(uuid) to authenticated;
grant execute on function public.get_operation_excellence(uuid) to service_role;

-- B6.2 hardening: the evaluator is an internal lifecycle primitive, not a product RPC.
revoke execute on function public.evaluate_operational_excellence(uuid, boolean) from authenticated;
revoke execute on function public.evaluate_operational_excellence(uuid, boolean) from anon;
grant execute on function public.evaluate_operational_excellence(uuid, boolean) to service_role;

-- QA projections must not remain callable by product roles if present in the environment.
do $$
begin
  if to_regprocedure('public.get_v31b_b5_runtime_excellence(uuid)') is not null then
    execute 'revoke execute on function public.get_v31b_b5_runtime_excellence(uuid) from anon, authenticated';
  end if;
  if to_regprocedure('public.get_v31b_b4_qa_excellence()') is not null then
    execute 'revoke execute on function public.get_v31b_b4_qa_excellence() from anon, authenticated';
  end if;
end;
$$;
