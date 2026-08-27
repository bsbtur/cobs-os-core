-- V3.1-B5.4 QA-only runtime projection.
-- Accepts only final snapshots belonging to the synthetic B4/B5 QA operation.
-- Never migrate to production.

create or replace function public.get_v31b_b5_runtime_excellence(p_snapshot_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
with snap as (
  select s.*
  from public.operational_excellence_snapshots s
  join public.operations o on o.id=s.operation_id
  where s.id=p_snapshot_id
    and s.evaluation_status='final'
    and o.code='V31B-B4-QA-94'
    and o.metadata->>'qa_fixture'='v31b-b4'
  limit 1
), op as (
  select o.id,o.code,o.name,o.status
  from public.operations o
  join snap s on s.operation_id=o.id
), model as (
  select m.* from public.operational_score_models m join snap s on s.model_id=m.id
), ev as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'dimension_key',e.dimension_key,
    'outcome',e.outcome,
    'points_awarded',e.points_awarded,
    'points_possible',e.points_possible,
    'evidence',e.evidence
  ) order by e.dimension_key),'[]'::jsonb) rows
  from public.operational_score_evidence e join snap s on s.id=e.snapshot_id
)
select case when not exists(select 1 from snap) then null else jsonb_build_object(
  'operation',(select jsonb_build_object('id',id,'code',code,'name',name,'status',status) from op),
  'snapshot',(select jsonb_build_object(
    'id',id,'score',score,'rounded_score',rounded_score,'classification',classification,
    'evaluation_status',evaluation_status,'coverage_percent',coverage_percent,
    'dimension_scores',dimension_scores,'evaluated_at',evaluated_at,'finalized_at',finalized_at,
    'facts_fingerprint',facts_fingerprint
  ) from snap),
  'model',(select jsonb_build_object('model_key',model_key,'version',version,'weights',weights,'rules',rules) from model),
  'evidence',(select rows from ev)
) end;
$$;
revoke all on function public.get_v31b_b5_runtime_excellence(uuid) from public;
grant execute on function public.get_v31b_b5_runtime_excellence(uuid) to anon,authenticated,service_role;
