-- W11 HOTFIX: operational field-crew access (read + runtime facts only) and explicit content clearing.

-- 1) Canonical link auth user -> person -> crew participation -> operational responsibility.
create or replace function app_private.w11_field_crew(_operation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog','public'
as $$
  select exists (
    select 1
      from public.operation_participations op
      join public.people pe
        on pe.id = op.person_id
       and pe.tenant_id = op.tenant_id
      join public.operation_role_assignments ora
        on ora.participation_id = op.id
       and ora.tenant_id = op.tenant_id
      join public.operation_role_types ort
        on ort.id = ora.role_type_id
       and ort.tenant_id = op.tenant_id
     where op.operation_id = _operation_id
       and op.participation_kind = 'crew'
       and op.status in ('expected','confirmed')
       and pe.profile_id = (select auth.uid())
       and ort.is_active = true
       and ort.key in ('guide','coordinator','academic_coordinator','monitor')
  )
$$;

revoke all on function app_private.w11_field_crew(uuid) from public, anon;

create or replace function app_private.w11_can_operate(_operation_id uuid, _tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog','public'
as $$
  select (select auth.uid()) is not null
     and (
       app_private.has_tenant_role(_tenant_id, array['owner','admin','operations_agent']::public.app_role[])
       or app_private.w11_field_crew(_operation_id)
     )
$$;

revoke all on function app_private.w11_can_operate(uuid, uuid) from public, anon;

-- 2) Read access for the operational crew of that single operation (never wider).
create policy "Field crew read visit points" on public.journey_visit_points
  for select to authenticated
  using (app_private.w11_field_crew(operation_id));

create policy "Field crew read visit point events" on public.journey_visit_point_events
  for select to authenticated
  using (app_private.w11_field_crew(operation_id));

-- 3) Operational resolvers: read + execute, never plan.
create or replace function app_private.w11_step_operational(_journey_step_id uuid)
returns public.journey_steps
language plpgsql
stable
security definer
set search_path = 'pg_catalog','public'
as $$
declare _step public.journey_steps;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into _step from public.journey_steps s where s.id = _journey_step_id;
  if _step.id is null then raise exception 'Journey step not found'; end if;
  if not app_private.w11_can_operate(_step.operation_id, _step.tenant_id) then
    raise exception 'You do not have permission for this operation runtime';
  end if;
  return _step;
end;
$$;

create or replace function app_private.w11_point_operational(_visit_point_id uuid)
returns public.journey_visit_points
language plpgsql
stable
security definer
set search_path = 'pg_catalog','public'
as $$
declare _point public.journey_visit_points;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into _point from public.journey_visit_points p where p.id = _visit_point_id;
  if _point.id is null then raise exception 'Visit point not found'; end if;
  if not app_private.w11_can_operate(_point.operation_id, _point.tenant_id) then
    raise exception 'You do not have permission for this operation runtime';
  end if;
  return _point;
end;
$$;

-- 4) Runtime commands / reads now accept elevated roles OR the operation's field crew.
create or replace function public.record_visit_point_event(
  _visit_point_id uuid,
  _event_type public.visit_point_event_type,
  _idempotency_key text,
  _reason text default null,
  _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare
  _point public.journey_visit_points;
  _op public.operations;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),'');
  _at timestamptz;
  _existing jsonb;
  _id uuid;
begin
  _point := app_private.w11_point_operational(_visit_point_id);
  _op := app_private.w11_assert_open(_point.operation_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _event_type = 'VISIT_POINT_SKIPPED' and _point.is_required and _why is null then
    raise exception 'A required visit point can only be skipped with a reason';
  end if;
  perform app_private.assert_generic_note(_why);

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid()
      and k.action = 'journey.visit_point_event'
      and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  _at := app_private.w04_assert_occurred_at(_op, _occurred_at);

  perform set_config('app.w11_control','on', true);
  insert into public.journey_visit_point_events (
    tenant_id, operation_id, journey_step_id, visit_point_id, event_type,
    actor_profile_id, occurred_at, reason, idempotency_key)
  values (_point.tenant_id, _point.operation_id, _point.journey_step_id, _point.id, _event_type,
    auth.uid(), _at, _why, _key)
  on conflict (visit_point_id, event_type) do nothing
  returning id into _id;
  perform set_config('app.w11_control','off', true);

  if _id is null then
    select e.id into _id from public.journey_visit_point_events e
     where e.visit_point_id = _point.id and e.event_type = _event_type;
  end if;

  perform app_private.record_audit_event(_point.tenant_id, auth.uid(), 'journey.visit_point_event',
    'journey_visit_point', _point.id, _key,
    jsonb_build_object('operation_id', _point.operation_id,
                       'journey_step_id', _point.journey_step_id,
                       'event_type', _event_type));

  _existing := jsonb_build_object('visit_point_event_id', _id, 'visit_point_id', _point.id,
                                  'event_type', _event_type);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_point.tenant_id, auth.uid(), 'journey.visit_point_event', _key, _existing)
  on conflict (actor_profile_id, action, idempotency_key) do nothing;
  return _existing;
end;
$$;

create or replace function public.list_step_visit_points(_journey_step_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _rows jsonb;
begin
  _step := app_private.w11_step_operational(_journey_step_id);
  select coalesce(jsonb_agg(jsonb_build_object(
           'visit_point_id', p.id,
           'journey_step_id', p.journey_step_id,
           'operation_id', p.operation_id,
           'sequence', p.sequence,
           'title', p.title,
           'interpretive_content', p.interpretive_content,
           'operational_note', p.operational_note,
           'estimated_minutes', p.estimated_minutes,
           'is_required', p.is_required,
           'started', exists (select 1 from public.journey_visit_point_events e
                              where e.visit_point_id = p.id and e.event_type = 'VISIT_POINT_STARTED'),
           'resolution', (select e.event_type::text from public.journey_visit_point_events e
                           where e.visit_point_id = p.id
                             and e.event_type in ('VISIT_POINT_COMPLETED','VISIT_POINT_SKIPPED')
                           order by e.occurred_at desc, e.recorded_at desc limit 1)
         ) order by p.sequence), '[]'::jsonb)
    into _rows
    from public.journey_visit_points p
   where p.journey_step_id = _step.id;
  return _rows;
end;
$$;

create or replace function public.visit_point_runtime_state(_journey_step_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare
  _step public.journey_steps;
  _total int; _resolved int; _required_pending int; _current uuid;
begin
  _step := app_private.w11_step_operational(_journey_step_id);

  with points as (
    select p.id, p.sequence, p.is_required,
           exists (select 1 from public.journey_visit_point_events e
                    where e.visit_point_id = p.id
                      and e.event_type in ('VISIT_POINT_COMPLETED','VISIT_POINT_SKIPPED')) as resolved
      from public.journey_visit_points p
     where p.journey_step_id = _step.id
  )
  select count(*)::int,
         count(*) filter (where resolved)::int,
         count(*) filter (where not resolved and is_required)::int,
         (select id from points where not resolved order by sequence limit 1)
    into _total, _resolved, _required_pending, _current
    from points;

  return jsonb_build_object(
    'journey_step_id', _step.id,
    'operation_id', _step.operation_id,
    'total', coalesce(_total,0),
    'resolved', coalesce(_resolved,0),
    'required_pending', coalesce(_required_pending,0),
    'current_visit_point_id', _current,
    'all_resolved', coalesce(_total,0) > 0 and coalesce(_total,0) = coalesce(_resolved,0),
    'blocks_step_completion', false);
end;
$$;

-- 5) Explicit clearing semantics for interpretive content and operational note.
drop function if exists public.update_visit_point(uuid, text, text, text, integer, boolean, boolean);

create or replace function public.update_visit_point(
  _visit_point_id uuid,
  _title text default null,
  _interpretive_content text default null,
  _operational_note text default null,
  _estimated_minutes integer default null,
  _is_required boolean default null,
  _clear_estimated_minutes boolean default false,
  _clear_interpretive_content boolean default false,
  _clear_operational_note boolean default false)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _point public.journey_visit_points;
begin
  -- Planning stays elevated-only: field crew can read and execute, never plan.
  _point := app_private.w11_point(_visit_point_id, array['owner','admin','operations_agent']);
  perform app_private.w11_assert_open(_point.operation_id);
  if _title is not null and nullif(btrim(_title),'') is null then
    raise exception 'A visit point needs a title';
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_operational_note,'')),''));

  perform set_config('app.w11_control','on', true);
  update public.journey_visit_points p
     set title = coalesce(nullif(btrim(coalesce(_title,'')),''), p.title),
         interpretive_content = case when coalesce(_clear_interpretive_content,false) then null
                                     else coalesce(nullif(btrim(coalesce(_interpretive_content,'')),''),
                                                   p.interpretive_content) end,
         operational_note = case when coalesce(_clear_operational_note,false) then null
                                 else coalesce(nullif(btrim(coalesce(_operational_note,'')),''),
                                               p.operational_note) end,
         estimated_minutes = case when coalesce(_clear_estimated_minutes,false) then null
                                  else coalesce(_estimated_minutes, p.estimated_minutes) end,
         is_required = coalesce(_is_required, p.is_required)
   where p.id = _point.id
   returning * into _point;
  perform set_config('app.w11_control','off', true);

  perform app_private.record_audit_event(_point.tenant_id, auth.uid(), 'journey.visit_point_updated',
    'journey_visit_point', _point.id, null,
    jsonb_build_object('operation_id', _point.operation_id, 'journey_step_id', _point.journey_step_id));

  return jsonb_build_object('visit_point_id', _point.id, 'sequence', _point.sequence);
end;
$$;

revoke all on function public.update_visit_point(uuid, text, text, text, integer, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.update_visit_point(uuid, text, text, text, integer, boolean, boolean, boolean, boolean) to authenticated, service_role;