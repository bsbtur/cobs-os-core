-- COBS Human Experience V3.1-A
-- Stage Completion Achievement Evaluator + visit-point minimum rule.

create or replace function app_private.v31a_visit_point_readiness(_journey_step_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _step public.journey_steps;
  _total integer := 0;
  _visited integer := 0;
  _required_total integer := 0;
  _required_visited integer := 0;
  _minimum integer := 0;
  _missing_required jsonb := '[]'::jsonb;
begin
  select * into _step from public.journey_steps where id = _journey_step_id;
  if _step.id is null then raise exception 'Journey step not found'; end if;

  with active_points as (
    select p.*,
      coalesce((p.metadata->>'is_required')::boolean, false) as is_required,
      (
        select e.event_type
        from public.journey_visit_point_events e
        where e.visit_point_id = p.id
        order by e.occurred_at desc, e.id desc
        limit 1
      ) as latest_status
    from public.journey_visit_points p
    where p.journey_step_id = _step.id
      and not coalesce((p.metadata->>'archived')::boolean, false)
  )
  select
    count(*)::int,
    count(*) filter (where latest_status = 'VISITED')::int,
    count(*) filter (where is_required)::int,
    count(*) filter (where is_required and latest_status = 'VISITED')::int,
    coalesce(
      jsonb_agg(jsonb_build_object('id', id, 'title', title) order by sequence)
        filter (where is_required and latest_status is distinct from 'VISITED'),
      '[]'::jsonb
    )
  into _total, _visited, _required_total, _required_visited, _missing_required
  from active_points;

  if _total = 0 then
    _minimum := 0;
  elsif nullif(_step.metadata->>'visit_point_minimum', '') is not null then
    _minimum := greatest(0, least(_total, (_step.metadata->>'visit_point_minimum')::integer));
  else
    _minimum := least(2, _total);
  end if;

  return jsonb_build_object(
    'step_id', _step.id,
    'total', _total,
    'visited', _visited,
    'required_total', _required_total,
    'required_visited', _required_visited,
    'minimum', _minimum,
    'missing_required', _missing_required,
    'required_ok', _required_total = _required_visited,
    'minimum_ok', _visited >= _minimum,
    'ready', (_required_total = _required_visited) and (_visited >= _minimum)
  );
end;
$function$;

revoke all on function app_private.v31a_visit_point_readiness(uuid) from public, anon, authenticated;

create or replace function public.get_step_visit_point_readiness(_journey_step_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _step public.journey_steps;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  return app_private.v31a_visit_point_readiness(_step.id);
end;
$function$;

revoke all on function public.get_step_visit_point_readiness(uuid) from public, anon;
grant execute on function public.get_step_visit_point_readiness(uuid) to authenticated;

create or replace function public.set_visit_point_completion_rule(
  _journey_step_id uuid,
  _minimum_presented integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _step public.journey_steps;
  _op public.operations;
  _minimum integer := coalesce(_minimum_presented, 2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations where id = _step.operation_id;
  if _op.status not in ('draft','planning') then
    raise exception 'Visit point completion rule can only change in draft or planning';
  end if;
  if _minimum < 0 or _minimum > 100 then
    raise exception 'Minimum presented points must be between 0 and 100';
  end if;

  update public.journey_steps
  set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{visit_point_minimum}', to_jsonb(_minimum), true),
      updated_at = now()
  where id = _step.id;

  perform app_private.record_audit_event(
    _step.tenant_id, auth.uid(), 'journey.visit_point_rule_changed', 'journey_step', _step.id, null,
    jsonb_build_object('operation_id', _step.operation_id, 'minimum_presented', _minimum)
  );

  return jsonb_build_object('journey_step_id', _step.id, 'minimum_presented', _minimum);
end;
$function$;

revoke all on function public.set_visit_point_completion_rule(uuid,integer) from public, anon;
grant execute on function public.set_visit_point_completion_rule(uuid,integer) to authenticated;

-- Preserve legacy wrapper while actually persisting the V1.1 required/minutes metadata.
create or replace function public.create_visit_point(
  _journey_step_id uuid,
  _title text,
  _idempotency_key text,
  _interpretive_content text default null,
  _operational_note text default null,
  _estimated_minutes integer default null,
  _is_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _result jsonb;
  _point_id uuid;
  _metadata jsonb := '{}'::jsonb;
begin
  if nullif(btrim(coalesce(_idempotency_key, '')), '') is null then
    raise exception 'Idempotency key is required';
  end if;
  if _estimated_minutes is not null and (_estimated_minutes <= 0 or _estimated_minutes > 1440) then
    raise exception 'Estimated minutes must be between 1 and 1440';
  end if;

  _result := public.create_journey_visit_point(
    _journey_step_id, _title, _interpretive_content, _operational_note
  );
  _point_id := (_result->>'visit_point_id')::uuid;
  _metadata := jsonb_build_object('is_required', coalesce(_is_required, false));
  if _estimated_minutes is not null then
    _metadata := _metadata || jsonb_build_object('estimated_minutes', _estimated_minutes);
  end if;
  update public.journey_visit_points
  set metadata = coalesce(metadata, '{}'::jsonb) || _metadata,
      updated_at = now()
  where id = _point_id;

  return _result || jsonb_build_object('is_required', coalesce(_is_required, false), 'estimated_minutes', _estimated_minutes);
end;
$function$;

revoke all on function public.create_visit_point(uuid,text,text,text,text,integer,boolean) from public, anon;
grant execute on function public.create_visit_point(uuid,text,text,text,text,integer,boolean) to authenticated;

create or replace function app_private.evaluate_stage_completion_achievements(
  _journey_step_id uuid,
  _completion_event_id uuid,
  _occurred_at timestamptz,
  _actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _step public.journey_steps;
  _point_readiness jsonb;
  _deadline timestamptz;
  _all_milestones boolean := false;
  _milestone_total integer := 0;
  _completion_count integer := 0;
  _awards jsonb := '[]'::jsonb;
  _grant jsonb;
begin
  select * into _step from public.journey_steps where id = _journey_step_id;
  if _step.id is null then raise exception 'Journey step not found'; end if;
  if _actor_profile_id is null then return jsonb_build_object('awards', _awards); end if;
  if not exists (select 1 from public.people p where p.tenant_id = _step.tenant_id and p.profile_id = _actor_profile_id) then
    return jsonb_build_object('awards', _awards);
  end if;

  select count(*)::int into _completion_count
  from public.journey_events e
  where e.tenant_id = _step.tenant_id
    and e.actor_profile_id = _actor_profile_id
    and e.event_type = 'STEP_COMPLETED';

  if _completion_count = 1 then
    _grant := app_private.grant_achievement(
      _step.tenant_id, 'first_mission', 'profile', _actor_profile_id, _step.operation_id,
      'STEP_COMPLETED', _completion_event_id,
      'achievement:first_mission:profile:' || _actor_profile_id::text,
      jsonb_build_object('journey_step_id', _step.id)
    );
    _awards := _awards || jsonb_build_array(_grant);
  end if;

  select count(*)::int,
         count(*) = count(*) filter (where latest_action = 'completed')
  into _milestone_total, _all_milestones
  from (
    select i.id,
      coalesce((select e.execution_action::text from public.playbook_executions e
                where e.playbook_item_id = i.id
                order by e.recorded_at desc, e.id desc limit 1), 'reopened') as latest_action
    from public.playbook_items i
    where i.journey_step_id = _step.id and i.is_active
  ) s;

  if _milestone_total > 0 and _all_milestones then
    _grant := app_private.grant_achievement(
      _step.tenant_id, 'milestone_master', 'profile', _actor_profile_id, _step.operation_id,
      'STEP_COMPLETED', _completion_event_id,
      'achievement:milestone_master:step:' || _step.id::text || ':profile:' || _actor_profile_id::text,
      jsonb_build_object('journey_step_id', _step.id, 'milestones', _milestone_total)
    );
    _awards := _awards || jsonb_build_array(_grant);
  end if;

  _deadline := coalesce(_step.expected_end, _step.planned_end);
  if _deadline is not null and coalesce(_occurred_at, clock_timestamp()) <= _deadline then
    _grant := app_private.grant_achievement(
      _step.tenant_id, 'time_keeper', 'profile', _actor_profile_id, _step.operation_id,
      'STEP_COMPLETED', _completion_event_id,
      'achievement:time_keeper:step:' || _step.id::text || ':profile:' || _actor_profile_id::text,
      jsonb_build_object('journey_step_id', _step.id, 'deadline', _deadline, 'completed_at', _occurred_at)
    );
    _awards := _awards || jsonb_build_array(_grant);
  end if;

  _point_readiness := app_private.v31a_visit_point_readiness(_step.id);
  if coalesce((_point_readiness->>'total')::integer, 0) > 0
     and coalesce((_point_readiness->>'ready')::boolean, false) then
    _grant := app_private.grant_achievement(
      _step.tenant_id, 'explorer', 'profile', _actor_profile_id, _step.operation_id,
      'STEP_COMPLETED', _completion_event_id,
      'achievement:explorer:step:' || _step.id::text || ':profile:' || _actor_profile_id::text,
      jsonb_build_object('journey_step_id', _step.id, 'visit_points', _point_readiness)
    );
    _awards := _awards || jsonb_build_array(_grant);
  end if;

  return jsonb_build_object('journey_step_id', _step.id, 'awards', _awards, 'visit_points', _point_readiness);
end;
$function$;

revoke all on function app_private.evaluate_stage_completion_achievements(uuid,uuid,timestamptz,uuid) from public, anon, authenticated;

-- Wire evaluator to the canonical completion fact. The existing operational readiness remains authoritative.
create or replace function public.complete_journey_step(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _step public.journey_steps;
  _op public.operations;
  _id uuid;
  _readiness jsonb;
  _point_readiness jsonb;
  _achievements jsonb;
  _actual_occurred_at timestamptz := coalesce(_occurred_at, clock_timestamp());
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;

  if _op.status <> 'active' then raise exception 'A journey step can only be completed while the operation is running'; end if;
  if not app_private.w04_has_event(_step.id, 'STEP_STARTED') then raise exception 'This step has not started yet'; end if;
  if app_private.w04_has_event(_step.id, 'STEP_COMPLETED') then
    return jsonb_build_object('journey_step_id', _step.id, 'unchanged', true);
  end if;
  if _step.step_kind in ('movement','return','disembarkation') and not app_private.w04_has_event(_step.id, 'ARRIVED') then
    raise exception 'The group has not arrived for this step yet';
  end if;

  _readiness := public.w04_step_readiness(_step.id);
  if not coalesce((_readiness->>'ready')::boolean, false) then
    raise exception 'This step is not ready to be completed. Resolve required presence and checklist items first.';
  end if;

  _point_readiness := app_private.v31a_visit_point_readiness(_step.id);
  if not coalesce((_point_readiness->>'ready')::boolean, false) then
    raise exception 'This visit is not ready. Complete every required point and the minimum number of presented points.';
  end if;

  _id := app_private.record_journey_event(_op, _step.id, 'STEP_COMPLETED', _actual_occurred_at);
  _achievements := app_private.evaluate_stage_completion_achievements(_step.id, _id, _actual_occurred_at, auth.uid());

  return jsonb_build_object(
    'journey_step_id', _step.id,
    'journey_event_id', _id,
    'readiness', _readiness,
    'visit_point_readiness', _point_readiness,
    'achievements', _achievements
  );
end;
$function$;

revoke all on function public.complete_journey_step(uuid,timestamptz) from public, anon;
grant execute on function public.complete_journey_step(uuid,timestamptz) to authenticated;
