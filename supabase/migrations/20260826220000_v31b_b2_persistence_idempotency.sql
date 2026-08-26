-- COBS V3.1-B2 — Persistence & Idempotency hardening
-- Serializes evaluations per operation/model, freezes terminal score and persists score audit.

create table if not exists public.operational_score_audit (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  operation_id uuid not null references public.operations(id) on delete cascade,
  snapshot_id uuid not null references public.operational_excellence_snapshots(id) on delete cascade,
  model_id uuid not null references public.operational_score_models(id),
  action text not null, correlation_id text not null,
  context jsonb not null default '{}'::jsonb, actor_profile_id uuid,
  created_at timestamptz not null default now(), unique(snapshot_id,action)
);
create index if not exists operational_score_audit_operation_idx on public.operational_score_audit(tenant_id,operation_id,created_at desc);
alter table public.operational_score_audit enable row level security;
revoke all on public.operational_score_audit from anon,authenticated;
grant select on public.operational_score_audit to authenticated;
create policy operational_score_audit_tenant_read on public.operational_score_audit for select to authenticated using(app_private.is_tenant_member(tenant_id));

create or replace function app_private.record_operational_score_audit(_tenant_id uuid,_snapshot_id uuid,_operation_id uuid,_model_id uuid,_evaluation_status text,_fingerprint text) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_id uuid;
begin
 insert into public.operational_score_audit(tenant_id,operation_id,snapshot_id,model_id,action,correlation_id,context,actor_profile_id)
 values(_tenant_id,_operation_id,_snapshot_id,_model_id,'SCORE_EVALUATED',_fingerprint,jsonb_build_object('evaluation_status',_evaluation_status,'facts_fingerprint',_fingerprint),auth.uid())
 on conflict(snapshot_id,action) do update set context=excluded.context returning id into v_id;
 perform app_private.record_audit_event(_tenant_id,auth.uid(),'SCORE_EVALUATED','operational_excellence_snapshot',_snapshot_id,_fingerprint,jsonb_build_object('operation_id',_operation_id,'model_id',_model_id,'evaluation_status',_evaluation_status,'facts_fingerprint',_fingerprint));
 return v_id;
end; $$;
revoke all on function app_private.record_operational_score_audit(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;

create or replace function public.evaluate_operational_excellence(p_operation_id uuid,p_finalize boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare op record; model record; facts jsonb; scored jsonb; fingerprint text; existing record; snapshot_id uuid; v_eval_status text; d jsonb; evidence_status text; outcome text; applicable boolean;
begin
 select o.id,o.tenant_id,o.status into op from public.operations o where o.id=p_operation_id;
 if not found then raise exception 'operation_not_found'; end if;
 if not app_private.is_tenant_member(op.tenant_id) then raise exception 'forbidden'; end if;
 select m.* into model from public.operational_score_models m where m.model_key='operational_excellence_v1' and m.status='active' order by m.version desc limit 1;
 if not found then raise exception 'score_model_not_found'; end if;
 -- Concurrency gate: exactly one evaluator may decide persistence for this operation/model at a time.
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text||':'||model.id::text,0));
 select s.* into existing from public.operational_excellence_snapshots s where s.operation_id=p_operation_id and s.model_id=model.id and s.evaluation_status='final' limit 1;
 if found then return jsonb_build_object('snapshot_id',existing.id,'operation_id',p_operation_id,'model',model.model_key,'model_version',model.version,'status','final','score',existing.score,'rounded_score',existing.rounded_score,'classification',existing.classification,'coverage_percent',existing.coverage_percent,'dimensions',existing.dimension_scores,'duplicate',true,'frozen',true); end if;
 facts:=app_private.collect_operational_excellence_facts(p_operation_id);
 fingerprint:=md5(facts::text||model.id::text||model.version::text);
 scored:=app_private.score_operational_dimensions(model.weights,facts->'dimensions',model.rules);
 v_eval_status:=case when scored->>'status'='insufficient_evidence' then 'insufficient_evidence' when p_finalize then 'final' else 'provisional' end;
 select s.* into existing from public.operational_excellence_snapshots s where s.operation_id=p_operation_id and s.model_id=model.id and s.facts_fingerprint=fingerprint and s.evaluation_status=v_eval_status limit 1;
 if found then return jsonb_build_object('snapshot_id',existing.id,'operation_id',p_operation_id,'model',model.model_key,'model_version',model.version,'status',existing.evaluation_status,'score',existing.score,'rounded_score',existing.rounded_score,'classification',existing.classification,'coverage_percent',existing.coverage_percent,'dimensions',existing.dimension_scores,'duplicate',true,'frozen',existing.evaluation_status='final'); end if;
 insert into public.operational_excellence_snapshots(tenant_id,operation_id,model_id,score,rounded_score,classification,evaluation_status,coverage_percent,dimension_scores,evidence_summary,finalized_at,facts_fingerprint)
 values(op.tenant_id,p_operation_id,model.id,(scored->>'score')::numeric,(scored->>'rounded_score')::integer,scored->>'classification',v_eval_status,coalesce((scored->>'coverage_percent')::numeric,0),coalesce(scored->'dimensions',facts->'dimensions'),jsonb_build_object('missing_dimensions',scored->'missing_dimensions','canonical_facts',facts),case when v_eval_status='final' then now() else null end,fingerprint) returning id into snapshot_id;
 for d in select value from jsonb_array_elements(coalesce(scored->'dimensions',facts->'dimensions')) loop
  applicable:=coalesce((d->>'applicable')::boolean,true); evidence_status:=coalesce(d->>'evidence_status','complete');
  outcome:=case when not applicable then 'not_applicable' when evidence_status<>'complete' then 'missing' when coalesce((d->>'ratio')::numeric,0)>=1 then 'pass' when coalesce((d->>'ratio')::numeric,0)>0 then 'partial' else 'fail' end;
  insert into public.operational_score_evidence(tenant_id,snapshot_id,dimension_key,rule_key,outcome,points_awarded,points_possible,evidence) values(op.tenant_id,snapshot_id,d->>'key',d->>'key',outcome,coalesce((d->>'points')::numeric,0),coalesce((d->>'weight')::numeric,0),coalesce(d->'evidence','{}'::jsonb));
 end loop;
 perform app_private.record_operational_score_audit(op.tenant_id,snapshot_id,p_operation_id,model.id,v_eval_status,fingerprint);
 return jsonb_build_object('snapshot_id',snapshot_id,'operation_id',p_operation_id,'model',model.model_key,'model_version',model.version,'status',v_eval_status,'score',scored->'score','rounded_score',scored->'rounded_score','classification',scored->'classification','coverage_percent',scored->'coverage_percent','dimensions',scored->'dimensions','duplicate',false,'frozen',v_eval_status='final');
end; $$;
revoke all on function public.evaluate_operational_excellence(uuid,boolean) from public,anon;
grant execute on function public.evaluate_operational_excellence(uuid,boolean) to authenticated,service_role;
