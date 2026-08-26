-- COBS Human Experience V3.1-B — Operational Excellence Score
-- Foundation: versioned model, explainable snapshots/evidence, canonical evaluator.

create table if not exists public.operational_score_models (
  id uuid primary key default gen_random_uuid(),
  model_key text not null,
  version integer not null check (version > 0),
  status text not null check (status in ('draft','active','retired')),
  weights jsonb not null,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (model_key, version)
);

create unique index if not exists operational_score_models_one_active_idx
  on public.operational_score_models (model_key)
  where status = 'active';

create table if not exists public.operational_excellence_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  operation_id uuid not null references public.operations(id) on delete cascade,
  model_id uuid not null references public.operational_score_models(id),
  score numeric(5,2),
  rounded_score integer,
  classification text,
  evaluation_status text not null check (evaluation_status in ('provisional','final','insufficient_evidence')),
  coverage_percent numeric(5,2) not null default 0,
  dimension_scores jsonb not null default '[]'::jsonb,
  evidence_summary jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  finalized_at timestamptz,
  facts_fingerprint text not null
);

create unique index if not exists operational_excellence_snapshots_same_facts_idx
  on public.operational_excellence_snapshots(operation_id, model_id, facts_fingerprint, evaluation_status);

create unique index if not exists operational_excellence_snapshots_final_idx
  on public.operational_excellence_snapshots(operation_id, model_id)
  where evaluation_status = 'final';

create index if not exists operational_excellence_snapshots_tenant_operation_idx
  on public.operational_excellence_snapshots(tenant_id, operation_id, evaluated_at desc);

create table if not exists public.operational_score_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  snapshot_id uuid not null references public.operational_excellence_snapshots(id) on delete cascade,
  dimension_key text not null,
  rule_key text not null,
  outcome text not null check (outcome in ('pass','partial','fail','not_applicable','missing')),
  points_awarded numeric(6,2),
  points_possible numeric(6,2),
  source_type text,
  source_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operational_score_evidence_snapshot_idx
  on public.operational_score_evidence(snapshot_id, dimension_key);

alter table public.operational_score_models enable row level security;
alter table public.operational_excellence_snapshots enable row level security;
alter table public.operational_score_evidence enable row level security;

revoke all on public.operational_score_models from anon, authenticated;
revoke all on public.operational_excellence_snapshots from anon, authenticated;
revoke all on public.operational_score_evidence from anon, authenticated;

grant select on public.operational_score_models to authenticated;
grant select on public.operational_excellence_snapshots to authenticated;
grant select on public.operational_score_evidence to authenticated;

create policy operational_score_models_read_active
  on public.operational_score_models for select to authenticated
  using (status = 'active');

create policy operational_excellence_snapshots_tenant_read
  on public.operational_excellence_snapshots for select to authenticated
  using (app_private.is_tenant_member(tenant_id));

create policy operational_score_evidence_tenant_read
  on public.operational_score_evidence for select to authenticated
  using (app_private.is_tenant_member(tenant_id));

insert into public.operational_score_models(model_key, version, status, weights, rules)
values (
  'operational_excellence_v1',
  1,
  'active',
  '{"journey_execution":30,"temporal_precision":25,"operational_compliance":20,"flow_traceability":15,"communication_readiness":10}'::jsonb,
  '{
    "classification":{"gold":90,"silver":80,"bronze":70,"developing":0},
    "temporal":{"on_time_minutes":5,"minor_minutes":15,"moderate_minutes":30,"minor_ratio":0.8,"moderate_ratio":0.5,"major_ratio":0.2}
  }'::jsonb
)
on conflict (model_key, version) do update
set weights = excluded.weights,
    rules = excluded.rules;

create or replace function app_private.score_operational_dimensions(
  p_weights jsonb,
  p_dimensions jsonb,
  p_rules jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  d jsonb;
  k text;
  applicable boolean;
  evidence_status text;
  ratio numeric;
  base_weight numeric;
  applicable_weight numeric := 0;
  complete_applicable integer := 0;
  applicable_count integer := 0;
  weighted_score numeric := 0;
  normalized_weight numeric;
  points numeric;
  result_dimensions jsonb := '[]'::jsonb;
  missing_keys jsonb := '[]'::jsonb;
  final_score numeric;
  rounded integer;
  classification text;
  coverage numeric;
begin
  for d in select value from jsonb_array_elements(coalesce(p_dimensions,'[]'::jsonb)) loop
    k := d->>'key';
    applicable := coalesce((d->>'applicable')::boolean, true);
    evidence_status := coalesce(d->>'evidence_status','complete');
    base_weight := coalesce((p_weights->>k)::numeric,0);
    if applicable then
      applicable_count := applicable_count + 1;
      applicable_weight := applicable_weight + base_weight;
      if evidence_status = 'complete' then
        complete_applicable := complete_applicable + 1;
      else
        missing_keys := missing_keys || jsonb_build_array(k);
      end if;
    end if;
  end loop;

  coverage := case when applicable_count = 0 then 0 else round((complete_applicable::numeric/applicable_count::numeric)*100,2) end;

  if applicable_count = 0 or applicable_weight <= 0 or jsonb_array_length(missing_keys) > 0 then
    return jsonb_build_object(
      'status','insufficient_evidence',
      'score',null,
      'rounded_score',null,
      'classification',null,
      'coverage_percent',coverage,
      'dimensions',p_dimensions,
      'missing_dimensions',missing_keys
    );
  end if;

  for d in select value from jsonb_array_elements(p_dimensions) loop
    k := d->>'key';
    applicable := coalesce((d->>'applicable')::boolean, true);
    base_weight := coalesce((p_weights->>k)::numeric,0);
    if applicable then
      ratio := greatest(0, least(1, coalesce((d->>'ratio')::numeric,0)));
      normalized_weight := (base_weight/applicable_weight)*100;
      points := round(normalized_weight*ratio,2);
      weighted_score := weighted_score + points;
      result_dimensions := result_dimensions || jsonb_build_array(
        d || jsonb_build_object('weight',round(normalized_weight,2),'points',points)
      );
    else
      result_dimensions := result_dimensions || jsonb_build_array(
        d || jsonb_build_object('weight',0,'points',0)
      );
    end if;
  end loop;

  final_score := round(weighted_score,2);
  rounded := round(final_score)::integer;
  classification := case
    when final_score >= coalesce((p_rules#>>'{classification,gold}')::numeric,90) then 'gold'
    when final_score >= coalesce((p_rules#>>'{classification,silver}')::numeric,80) then 'silver'
    when final_score >= coalesce((p_rules#>>'{classification,bronze}')::numeric,70) then 'bronze'
    else 'developing'
  end;

  return jsonb_build_object(
    'status','scored',
    'score',final_score,
    'rounded_score',rounded,
    'classification',classification,
    'coverage_percent',coverage,
    'dimensions',result_dimensions,
    'missing_dimensions','[]'::jsonb
  );
end;
$$;

revoke all on function app_private.score_operational_dimensions(jsonb,jsonb,jsonb) from public, anon, authenticated;

create or replace function app_private.collect_operational_excellence_facts(p_operation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  op record;
  total_steps integer;
  completed_steps integer;
  planned_steps integer;
  timed_steps integer;
  temporal_ratio numeric;
  required_points integer;
  required_visited integer;
  flow_steps integer;
  flow_completed integer;
  dims jsonb := '[]'::jsonb;
  timing_detail jsonb;
begin
  select id, tenant_id, status, completed_at into op
  from public.operations where id = p_operation_id;
  if not found then raise exception 'operation_not_found'; end if;

  select count(*) into total_steps from public.journey_steps where operation_id=p_operation_id;
  select count(distinct js.id) into completed_steps
  from public.journey_steps js
  where js.operation_id=p_operation_id
    and exists (select 1 from public.journey_events je where je.journey_step_id=js.id and je.event_type='STEP_COMPLETED');

  dims := dims || jsonb_build_array(jsonb_build_object(
    'key','journey_execution','applicable',true,
    'evidence_status',case when total_steps>0 then 'complete' else 'missing' end,
    'ratio',case when total_steps>0 then completed_steps::numeric/total_steps else null end,
    'evidence',jsonb_build_object('total_steps',total_steps,'completed_steps',completed_steps)
  ));

  select count(*) into planned_steps from public.journey_steps where operation_id=p_operation_id and planned_start is not null;
  select count(*) into timed_steps
  from public.journey_steps js
  where js.operation_id=p_operation_id and js.planned_start is not null
    and exists (select 1 from public.journey_events je where je.journey_step_id=js.id and je.event_type='STEP_STARTED');

  if planned_steps=0 then
    dims := dims || jsonb_build_array(jsonb_build_object('key','temporal_precision','applicable',false,'evidence_status','complete','ratio',null,'evidence',jsonb_build_object('reason','no_planned_timestamps')));
  elsif timed_steps < planned_steps then
    dims := dims || jsonb_build_array(jsonb_build_object('key','temporal_precision','applicable',true,'evidence_status','missing','ratio',null,'evidence',jsonb_build_object('planned_steps',planned_steps,'timed_steps',timed_steps)));
  else
    select avg(case
      when extract(epoch from (actual_start-planned_start))/60 <= 5 then 1.0
      when extract(epoch from (actual_start-planned_start))/60 <= 15 then 0.8
      when extract(epoch from (actual_start-planned_start))/60 <= 30 then 0.5
      else 0.2 end),
      jsonb_agg(jsonb_build_object('step_id',id,'delay_minutes',round((extract(epoch from (actual_start-planned_start))/60)::numeric,2)))
    into temporal_ratio, timing_detail
    from (
      select js.id, js.planned_start,
        (select min(je.occurred_at) from public.journey_events je where je.journey_step_id=js.id and je.event_type='STEP_STARTED') actual_start
      from public.journey_steps js where js.operation_id=p_operation_id and js.planned_start is not null
    ) q;
    dims := dims || jsonb_build_array(jsonb_build_object('key','temporal_precision','applicable',true,'evidence_status','complete','ratio',temporal_ratio,'evidence',coalesce(timing_detail,'[]'::jsonb)));
  end if;

  select count(*) into required_points
  from public.journey_visit_points
  where operation_id=p_operation_id and coalesce((metadata->>'is_required')::boolean,false);
  select count(distinct vp.id) into required_visited
  from public.journey_visit_points vp
  where vp.operation_id=p_operation_id and coalesce((vp.metadata->>'is_required')::boolean,false)
    and exists (select 1 from public.journey_visit_point_events ve where ve.visit_point_id=vp.id and ve.event_type in ('VISITED','PRESENTED','COMPLETED'));

  if required_points=0 then
    dims := dims || jsonb_build_array(jsonb_build_object('key','operational_compliance','applicable',false,'evidence_status','complete','ratio',null,'evidence',jsonb_build_object('reason','no_required_visit_points')));
  else
    dims := dims || jsonb_build_array(jsonb_build_object('key','operational_compliance','applicable',true,'evidence_status','complete','ratio',required_visited::numeric/required_points,'evidence',jsonb_build_object('required_points',required_points,'required_visited',required_visited)));
  end if;

  select count(*) into flow_steps
  from public.journey_steps
  where operation_id=p_operation_id and lower(step_kind) in ('meeting','boarding','disembarkation','transport','transfer','departure','arrival');
  select count(distinct js.id) into flow_completed
  from public.journey_steps js
  where js.operation_id=p_operation_id and lower(js.step_kind) in ('meeting','boarding','disembarkation','transport','transfer','departure','arrival')
    and exists (select 1 from public.journey_events je where je.journey_step_id=js.id and je.event_type='STEP_COMPLETED');

  if flow_steps=0 then
    dims := dims || jsonb_build_array(jsonb_build_object('key','flow_traceability','applicable',false,'evidence_status','complete','ratio',null,'evidence',jsonb_build_object('reason','no_flow_steps')));
  else
    dims := dims || jsonb_build_array(jsonb_build_object('key','flow_traceability','applicable',true,'evidence_status','complete','ratio',flow_completed::numeric/flow_steps,'evidence',jsonb_build_object('flow_steps',flow_steps,'flow_completed',flow_completed,'traveler_no_show_penalty',false)));
  end if;

  -- Communication remains N/A unless a canonical operation-scoped communication projection is available.
  -- V3.1-B intentionally never infers communication quality from unrelated message tables.
  dims := dims || jsonb_build_array(jsonb_build_object('key','communication_readiness','applicable',false,'evidence_status','complete','ratio',null,'evidence',jsonb_build_object('reason','canonical_operation_communication_projection_not_available')));

  return jsonb_build_object(
    'operation_id',op.id,
    'tenant_id',op.tenant_id,
    'operation_status',op.status,
    'completed_at',op.completed_at,
    'dimensions',dims
  );
end;
$$;

revoke all on function app_private.collect_operational_excellence_facts(uuid) from public, anon, authenticated;

create or replace function public.evaluate_operational_excellence(
  p_operation_id uuid,
  p_finalize boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  op record;
  model record;
  facts jsonb;
  scored jsonb;
  fingerprint text;
  existing record;
  snapshot_id uuid;
  status text;
  d jsonb;
  evidence_status text;
  outcome text;
  applicable boolean;
begin
  select id, tenant_id, status into op from public.operations where id=p_operation_id;
  if not found then raise exception 'operation_not_found'; end if;
  if not app_private.is_tenant_member(op.tenant_id) then raise exception 'forbidden'; end if;

  select * into model from public.operational_score_models
  where model_key='operational_excellence_v1' and status='active'
  order by version desc limit 1;
  if not found then raise exception 'score_model_not_found'; end if;

  select * into existing from public.operational_excellence_snapshots
  where operation_id=p_operation_id and model_id=model.id and evaluation_status='final'
  limit 1;
  if found then
    return jsonb_build_object('snapshot_id',existing.id,'operation_id',p_operation_id,'model',model.model_key,'model_version',model.version,'status','final','score',existing.score,'rounded_score',existing.rounded_score,'classification',existing.classification,'coverage_percent',existing.coverage_percent,'dimensions',existing.dimension_scores,'frozen',true);
  end if;

  facts := app_private.collect_operational_excellence_facts(p_operation_id);
  fingerprint := md5(facts::text || model.id::text || model.version::text);
  scored := app_private.score_operational_dimensions(model.weights, facts->'dimensions', model.rules);

  status := case
    when scored->>'status'='insufficient_evidence' then 'insufficient_evidence'
    when p_finalize then 'final'
    else 'provisional'
  end;

  if p_finalize and op.status <> 'completed' then raise exception 'operation_must_be_completed_to_finalize_score'; end if;
  if p_finalize and scored->>'status'='insufficient_evidence' then status := 'insufficient_evidence'; end if;

  select * into existing from public.operational_excellence_snapshots
  where operation_id=p_operation_id and model_id=model.id and facts_fingerprint=fingerprint and evaluation_status=status
  limit 1;
  if found then
    return jsonb_build_object('snapshot_id',existing.id,'operation_id',p_operation_id,'model',model.model_key,'model_version',model.version,'status',existing.evaluation_status,'score',existing.score,'rounded_score',existing.rounded_score,'classification',existing.classification,'coverage_percent',existing.coverage_percent,'dimensions',existing.dimension_scores,'duplicate',true,'frozen',false);
  end if;

  insert into public.operational_excellence_snapshots(
    tenant_id, operation_id, model_id, score, rounded_score, classification,
    evaluation_status, coverage_percent, dimension_scores, evidence_summary,
    finalized_at, facts_fingerprint
  ) values (
    op.tenant_id, p_operation_id, model.id,
    (scored->>'score')::numeric, (scored->>'rounded_score')::integer, scored->>'classification',
    status, coalesce((scored->>'coverage_percent')::numeric,0), scored->'dimensions',
    jsonb_build_object('missing_dimensions',scored->'missing_dimensions','canonical_facts',facts),
    case when status='final' then now() else null end,
    fingerprint
  ) returning id into snapshot_id;

  for d in select value from jsonb_array_elements(coalesce(scored->'dimensions',facts->'dimensions')) loop
    applicable := coalesce((d->>'applicable')::boolean,true);
    evidence_status := coalesce(d->>'evidence_status','complete');
    outcome := case
      when not applicable then 'not_applicable'
      when evidence_status <> 'complete' then 'missing'
      when coalesce((d->>'ratio')::numeric,0) >= 0.999 then 'pass'
      when coalesce((d->>'ratio')::numeric,0) <= 0 then 'fail'
      else 'partial'
    end;
    insert into public.operational_score_evidence(
      tenant_id,snapshot_id,dimension_key,rule_key,outcome,points_awarded,points_possible,source_type,evidence
    ) values (
      op.tenant_id,snapshot_id,d->>'key','v1_dimension',outcome,
      nullif(d->>'points','')::numeric,nullif(d->>'weight','')::numeric,'canonical_facts',coalesce(d->'evidence','{}'::jsonb)
    );
  end loop;

  return jsonb_build_object('snapshot_id',snapshot_id,'operation_id',p_operation_id,'model',model.model_key,'model_version',model.version,'status',status,'score',scored->'score','rounded_score',scored->'rounded_score','classification',scored->'classification','coverage_percent',scored->'coverage_percent','dimensions',scored->'dimensions','duplicate',false,'frozen',status='final');
end;
$$;

revoke all on function public.evaluate_operational_excellence(uuid,boolean) from public, anon;
grant execute on function public.evaluate_operational_excellence(uuid,boolean) to authenticated;

comment on function public.evaluate_operational_excellence(uuid,boolean) is
'V3.1-B canonical operational excellence evaluator. Reads server-side facts only; client cannot submit score.';
