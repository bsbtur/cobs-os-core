create type public.visit_point_event_type as enum (
  'VISIT_POINT_STARTED','VISIT_POINT_COMPLETED','VISIT_POINT_SKIPPED');

create table public.journey_visit_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  journey_step_id uuid not null,
  sequence integer not null,
  title text not null,
  interpretive_content text,
  operational_note text,
  estimated_minutes integer,
  is_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_visit_points_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint journey_visit_points_step_fk
    foreign key (journey_step_id, tenant_id) references public.journey_steps(id, tenant_id),
  constraint journey_visit_points_id_tenant_key unique (id, tenant_id),
  constraint journey_visit_points_title_present check (nullif(btrim(title),'') is not null),
  constraint journey_visit_points_minutes_range
    check (estimated_minutes is null or (estimated_minutes > 0 and estimated_minutes <= 1440))
);
create unique index journey_visit_points_step_sequence_key
  on public.journey_visit_points (journey_step_id, sequence);
create index journey_visit_points_step_idx
  on public.journey_visit_points (journey_step_id, sequence);
create index journey_visit_points_operation_idx
  on public.journey_visit_points (operation_id, sequence);

grant select on public.journey_visit_points to authenticated;
grant all on public.journey_visit_points to service_role;
alter table public.journey_visit_points enable row level security;
create policy "Elevated roles read visit points" on public.journey_visit_points
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

create table public.journey_visit_point_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  journey_step_id uuid not null,
  visit_point_id uuid not null,
  event_type public.visit_point_event_type not null,
  actor_profile_id uuid references public.profiles(id),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  reason text,
  idempotency_key text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint jvp_events_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint jvp_events_step_fk
    foreign key (journey_step_id, tenant_id) references public.journey_steps(id, tenant_id),
  constraint jvp_events_point_fk
    foreign key (visit_point_id, tenant_id) references public.journey_visit_points(id, tenant_id)
);
create unique index jvp_events_once
  on public.journey_visit_point_events (visit_point_id, event_type);
create index jvp_events_step_idx
  on public.journey_visit_point_events (journey_step_id, occurred_at desc, recorded_at desc);
create index jvp_events_operation_idx
  on public.journey_visit_point_events (operation_id, recorded_at desc);

grant select on public.journey_visit_point_events to authenticated;
grant all on public.journey_visit_point_events to service_role;
alter table public.journey_visit_point_events enable row level security;
create policy "Elevated roles read visit point events" on public.journey_visit_point_events
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

create or replace function app_private.w11_control_active()
returns boolean language sql stable set search_path = 'pg_catalog','public' as $$
  select coalesce(current_setting('app.w11_control', true), 'off') = 'on'
$$;

create or replace function public.guard_w11_mutation()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  if app_private.w11_control_active() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Visit point data can only change through the approved commands';
end;
$$;

create or replace function public.guard_w11_append_only()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create or replace function public.guard_visit_point_scope()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.operation_id is distinct from old.operation_id
     or new.journey_step_id is distinct from old.journey_step_id then
    raise exception 'A visit point cannot be moved between operations or steps';
  end if;
  return new;
end;
$$;

create trigger journey_visit_points_guard
  before insert or update or delete on public.journey_visit_points
  for each row execute function public.guard_w11_mutation();
create trigger journey_visit_points_scope
  before update on public.journey_visit_points
  for each row execute function public.guard_visit_point_scope();
create trigger journey_visit_points_updated_at
  before update on public.journey_visit_points
  for each row execute function public.set_updated_at();

create trigger jvp_events_guard
  before insert on public.journey_visit_point_events
  for each row execute function public.guard_w11_mutation();
create trigger jvp_events_append_only
  before update or delete on public.journey_visit_point_events
  for each row execute function public.guard_w11_append_only();

create or replace function app_private.w11_point(_visit_point_id uuid, _roles text[])
returns public.journey_visit_points language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _point public.journey_visit_points;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _point from public.journey_visit_points p where p.id = _visit_point_id;
  if _point.id is null then raise exception 'Visit point not found'; end if;
  if not app_private.has_tenant_role(_point.tenant_id, _roles::public.app_role[]) then
    raise exception 'You do not have permission for this operation runtime';
  end if;
  return _point;
end;
$$;

create or replace function app_private.w11_assert_open(_operation_id uuid)
returns public.operations language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _op public.operations;
begin
  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if _op.status in ('completed','cancelled') then
    raise exception 'A % operation no longer accepts visit point changes', _op.status;
  end if;
  return _op;
end;
$$;

create or replace function public.create_visit_point(
  _journey_step_id uuid,
  _title text,
  _idempotency_key text,
  _interpretive_content text default null,
  _operational_note text default null,
  _estimated_minutes integer default null,
  _is_required boolean default false)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare
  _step public.journey_steps;
  _row public.journey_visit_points;
  _seq int;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _existing jsonb;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  perform app_private.w11_assert_open(_step.operation_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if nullif(btrim(coalesce(_title,'')),'') is null then
    raise exception 'A visit point needs a title';
  end if;

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid()
      and k.action = 'journey.visit_point_create'
      and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_operational_note,'')),''));

  select coalesce(max(p.sequence), 0) + 10 into _seq
    from public.journey_visit_points p where p.journey_step_id = _step.id;

  perform set_config('app.w11_control','on', true);
  insert into public.journey_visit_points (
    tenant_id, operation_id, journey_step_id, sequence, title,
    interpretive_content, operational_note, estimated_minutes, is_required, created_by)
  values (_step.tenant_id, _step.operation_id, _step.id, _seq, btrim(_title),
    nullif(btrim(coalesce(_interpretive_content,'')),''),
    nullif(btrim(coalesce(_operational_note,'')),''),
    _estimated_minutes, coalesce(_is_required, false), auth.uid())
  returning * into _row;
  perform set_config('app.w11_control','off', true);

  perform app_private.record_audit_event(_step.tenant_id, auth.uid(), 'journey.visit_point_created',
    'journey_visit_point', _row.id, _key,
    jsonb_build_object('operation_id', _step.operation_id, 'journey_step_id', _step.id,
                       'sequence', _seq, 'is_required', _row.is_required));

  _existing := jsonb_build_object('visit_point_id', _row.id, 'sequence', _seq);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_step.tenant_id, auth.uid(), 'journey.visit_point_create', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.update_visit_point(
  _visit_point_id uuid,
  _title text default null,
  _interpretive_content text default null,
  _operational_note text default null,
  _estimated_minutes integer default null,
  _is_required boolean default null,
  _clear_estimated_minutes boolean default false)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _point public.journey_visit_points;
begin
  _point := app_private.w11_point(_visit_point_id, array['owner','admin','operations_agent']);
  perform app_private.w11_assert_open(_point.operation_id);
  if _title is not null and nullif(btrim(_title),'') is null then
    raise exception 'A visit point needs a title';
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_operational_note,'')),''));

  perform set_config('app.w11_control','on', true);
  update public.journey_visit_points p
     set title = coalesce(nullif(btrim(coalesce(_title,'')),''), p.title),
         interpretive_content = coalesce(nullif(btrim(coalesce(_interpretive_content,'')),''),
                                         p.interpretive_content),
         operational_note = coalesce(nullif(btrim(coalesce(_operational_note,'')),''),
                                     p.operational_note),
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

create or replace function public.reorder_visit_points(
  _journey_step_id uuid,
  _visit_point_ids uuid[])
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare
  _step public.journey_steps;
  _count int;
  _given int := coalesce(array_length(_visit_point_ids, 1), 0);
  _id uuid;
  _seq int := 0;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  perform app_private.w11_assert_open(_step.operation_id);

  select count(*)::int into _count
    from public.journey_visit_points p where p.journey_step_id = _step.id;
  if _given <> _count then
    raise exception 'The new order must list every visit point of this step exactly once';
  end if;
  if exists (
    select 1 from unnest(_visit_point_ids) as u(id)
    where not exists (select 1 from public.journey_visit_points p
                      where p.id = u.id and p.journey_step_id = _step.id)
  ) or (select count(distinct u.id) from unnest(_visit_point_ids) as u(id)) <> _given then
    raise exception 'The new order must list every visit point of this step exactly once';
  end if;

  perform set_config('app.w11_control','on', true);
  update public.journey_visit_points p
     set sequence = -1 * (p.sequence + 100000)
   where p.journey_step_id = _step.id;
  foreach _id in array _visit_point_ids loop
    _seq := _seq + 10;
    update public.journey_visit_points p set sequence = _seq where p.id = _id;
  end loop;
  perform set_config('app.w11_control','off', true);

  perform app_private.record_audit_event(_step.tenant_id, auth.uid(), 'journey.visit_points_reordered',
    'journey_step', _step.id, null,
    jsonb_build_object('operation_id', _step.operation_id, 'count', _given));

  return jsonb_build_object('journey_step_id', _step.id, 'count', _given);
end;
$$;

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
  _point := app_private.w11_point(_visit_point_id, array['owner','admin','operations_agent']);
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
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
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
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);

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

revoke all on function public.create_visit_point(uuid, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.create_visit_point(uuid, text, text, text, text, integer, boolean) to authenticated, service_role;

revoke all on function public.update_visit_point(uuid, text, text, text, integer, boolean, boolean) from public, anon;
grant execute on function public.update_visit_point(uuid, text, text, text, integer, boolean, boolean) to authenticated, service_role;

revoke all on function public.reorder_visit_points(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_visit_points(uuid, uuid[]) to authenticated, service_role;

revoke all on function public.record_visit_point_event(uuid, public.visit_point_event_type, text, text, timestamptz) from public, anon;
grant execute on function public.record_visit_point_event(uuid, public.visit_point_event_type, text, text, timestamptz) to authenticated, service_role;

revoke all on function public.list_step_visit_points(uuid) from public, anon;
grant execute on function public.list_step_visit_points(uuid) to authenticated, service_role;

revoke all on function public.visit_point_runtime_state(uuid) from public, anon;
grant execute on function public.visit_point_runtime_state(uuid) to authenticated, service_role;

revoke all on function app_private.w11_point(uuid, text[]) from public, anon, authenticated;
revoke all on function app_private.w11_assert_open(uuid) from public, anon, authenticated;
revoke all on function app_private.w11_control_active() from public, anon, authenticated;