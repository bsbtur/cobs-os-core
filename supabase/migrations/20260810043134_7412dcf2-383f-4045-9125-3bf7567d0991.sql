-- =====================================================================
-- COBS OS · W04 — JOURNEY · LIVE RUNTIME · PRESENCE · PLAYBOOKS
-- Additive only. W01/W02/W03 semantics untouched.
-- =====================================================================

-- ---------- 9 ENUMS ----------
create type public.journey_step_kind as enum (
  'meeting','boarding','movement','arrival','disembarkation','activity',
  'meal','hotel','event','break','free_time','return','other');

create type public.journey_event_type as enum (
  'STEP_STARTED','STEP_COMPLETED','STEP_SKIPPED','GATHERING_STARTED',
  'BOARDING_STARTED','BOARDING_COMPLETED','DEPARTURE_AUTHORIZED','DEPARTED',
  'ARRIVED','DISEMBARKATION_COMPLETED','EXPECTED_TIME_CHANGED','INCIDENT_NOTED',
  'READINESS_OVERRIDDEN');

create type public.presence_fact as enum (
  'PRESENT_AT_MEETING_POINT','BOARDED','DISEMBARKED','ABSENCE_NOTED','NO_SHOW_CONFIRMED');

create type public.playbook_requirement as enum ('required','recommended','informational');
create type public.playbook_item_kind as enum ('check','confirm','brief','verify','other');
create type public.playbook_execution_action as enum ('completed','reopened');
create type public.step_presence_requirement as enum ('none','accounted','boarded');
create type public.step_plan_origin as enum ('planned','ad_hoc');
create type public.step_presence_population as enum ('participants','all_confirmed');

-- ---------- FK-support additive indexes on frozen tables (no semantic change) ----------
create unique index if not exists operations_id_tenant_key
  on public.operations (id, tenant_id);
create unique index if not exists operation_participations_id_tenant_key
  on public.operation_participations (id, tenant_id);

-- ---------- 1. journey_steps ----------
create table public.journey_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  sequence integer not null,
  title text not null,
  description text,
  step_kind public.journey_step_kind not null,
  plan_origin public.step_plan_origin not null default 'planned',
  ad_hoc_reason text,
  planned_start timestamptz,
  planned_end timestamptz,
  expected_start timestamptz,
  expected_end timestamptz,
  location_label text,
  traveler_label text,
  traveler_facing boolean not null default false,
  presence_requirement public.step_presence_requirement not null default 'none',
  presence_population public.step_presence_population not null default 'participants',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_steps_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint journey_steps_id_tenant_key unique (id, tenant_id),
  constraint journey_steps_ad_hoc_has_no_baseline
    check (plan_origin = 'planned' or (planned_start is null and planned_end is null)),
  constraint journey_steps_ad_hoc_reason
    check (plan_origin = 'planned' or nullif(btrim(coalesce(ad_hoc_reason,'')),'') is not null)
);
create unique index journey_steps_operation_sequence_key
  on public.journey_steps (operation_id, sequence);
create index journey_steps_operation_idx on public.journey_steps (operation_id, sequence);

grant select on public.journey_steps to authenticated;
grant all on public.journey_steps to service_role;
alter table public.journey_steps enable row level security;
create policy "Elevated roles read journey steps" on public.journey_steps
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- ---------- 2. journey_events (append-only) ----------
create table public.journey_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  journey_step_id uuid,
  event_type public.journey_event_type not null,
  actor_profile_id uuid references public.profiles(id),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  note text,
  traveler_visible boolean not null default false,
  context jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint journey_events_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint journey_events_step_fk
    foreign key (journey_step_id, tenant_id) references public.journey_steps(id, tenant_id)
);
-- once-only milestones per step; repeatable facts are excluded
create unique index journey_events_milestone_once
  on public.journey_events (operation_id, coalesce(journey_step_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type)
  where event_type not in ('EXPECTED_TIME_CHANGED','INCIDENT_NOTED');
create index journey_events_operation_idx
  on public.journey_events (operation_id, occurred_at desc, recorded_at desc);
create index journey_events_step_idx on public.journey_events (journey_step_id, event_type);

grant select on public.journey_events to authenticated;
grant all on public.journey_events to service_role;
alter table public.journey_events enable row level security;
create policy "Elevated roles read runtime events" on public.journey_events
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- ---------- 3. participant_presence_events (append-only) ----------
create table public.participant_presence_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  participation_id uuid not null,
  journey_step_id uuid,
  presence_fact public.presence_fact not null,
  actor_profile_id uuid references public.profiles(id),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  note text,
  context jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint presence_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint presence_participation_fk
    foreign key (participation_id, tenant_id) references public.operation_participations(id, tenant_id),
  constraint presence_step_fk
    foreign key (journey_step_id, tenant_id) references public.journey_steps(id, tenant_id)
);
create unique index presence_fact_once
  on public.participant_presence_events
     (participation_id, coalesce(journey_step_id, '00000000-0000-0000-0000-000000000000'::uuid), presence_fact);
create index presence_step_idx
  on public.participant_presence_events (journey_step_id, participation_id, occurred_at desc);
create index presence_operation_idx
  on public.participant_presence_events (operation_id, occurred_at desc);

grant select on public.participant_presence_events to authenticated;
grant all on public.participant_presence_events to service_role;
alter table public.participant_presence_events enable row level security;
create policy "Elevated roles read presence facts" on public.participant_presence_events
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- ---------- 4. playbook_items ----------
create table public.playbook_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  journey_step_id uuid,
  title text not null,
  description text,
  item_kind public.playbook_item_kind not null default 'check',
  requirement public.playbook_requirement not null default 'required',
  owner_role_type_id uuid references public.operation_role_types(id),
  sequence integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint playbook_items_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint playbook_items_step_fk
    foreign key (journey_step_id, tenant_id) references public.journey_steps(id, tenant_id),
  constraint playbook_items_id_tenant_key unique (id, tenant_id)
);
create index playbook_items_step_idx on public.playbook_items (journey_step_id, sequence);
create index playbook_items_operation_idx on public.playbook_items (operation_id, sequence);

grant select on public.playbook_items to authenticated;
grant all on public.playbook_items to service_role;
alter table public.playbook_items enable row level security;
create policy "Elevated roles read playbook items" on public.playbook_items
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- ---------- 5. playbook_executions (append-only) ----------
create table public.playbook_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  playbook_item_id uuid not null,
  journey_step_id uuid,
  execution_action public.playbook_execution_action not null,
  actor_profile_id uuid references public.profiles(id),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  note text,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint playbook_exec_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint playbook_exec_item_fk
    foreign key (playbook_item_id, tenant_id) references public.playbook_items(id, tenant_id)
);
create index playbook_exec_item_idx
  on public.playbook_executions (playbook_item_id, recorded_at desc, id desc);
create index playbook_exec_operation_idx
  on public.playbook_executions (operation_id, recorded_at desc);

grant select on public.playbook_executions to authenticated;
grant all on public.playbook_executions to service_role;
alter table public.playbook_executions enable row level security;
create policy "Elevated roles read playbook executions" on public.playbook_executions
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- GUARDS
-- =====================================================================
create or replace function app_private.w04_control_active()
returns boolean language sql stable set search_path = 'pg_catalog','public' as $$
  select coalesce(current_setting('app.w04_control', true), 'off') = 'on'
$$;

create or replace function public.guard_w04_mutation()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  if app_private.w04_control_active() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'W04 runtime data can only change through the approved commands';
end;
$$;

create or replace function public.guard_w04_append_only()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create or replace function public.guard_journey_step_baseline()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
declare _status public.operation_status;
begin
  if new.plan_origin is distinct from old.plan_origin then
    raise exception 'A journey step cannot change between planned and ad-hoc';
  end if;
  if new.tenant_id is distinct from old.tenant_id or new.operation_id is distinct from old.operation_id then
    raise exception 'A journey step cannot be moved between operations';
  end if;
  select o.status into _status from public.operations o where o.id = new.operation_id;
  if _status not in ('draft','planning') then
    if new.plan_origin = 'planned'
       and (new.planned_start is distinct from old.planned_start
            or new.planned_end is distinct from old.planned_end
            or new.sequence is distinct from old.sequence) then
      raise exception 'The journey baseline is frozen from "ready" onward. Use the expected window instead.';
    end if;
  end if;
  return new;
end;
$$;

create trigger journey_steps_guard before insert or update or delete on public.journey_steps
  for each row execute function public.guard_w04_mutation();
create trigger journey_steps_baseline before update on public.journey_steps
  for each row execute function public.guard_journey_step_baseline();
create trigger journey_steps_updated_at before update on public.journey_steps
  for each row execute function public.set_updated_at();

create trigger playbook_items_guard before insert or update or delete on public.playbook_items
  for each row execute function public.guard_w04_mutation();
create trigger playbook_items_updated_at before update on public.playbook_items
  for each row execute function public.set_updated_at();

create trigger journey_events_guard before insert on public.journey_events
  for each row execute function public.guard_w04_mutation();
create trigger journey_events_append_only before update or delete on public.journey_events
  for each row execute function public.guard_w04_append_only();

create trigger presence_guard before insert on public.participant_presence_events
  for each row execute function public.guard_w04_mutation();
create trigger presence_append_only before update or delete on public.participant_presence_events
  for each row execute function public.guard_w04_append_only();

create trigger playbook_exec_guard before insert on public.playbook_executions
  for each row execute function public.guard_w04_mutation();
create trigger playbook_exec_append_only before update or delete on public.playbook_executions
  for each row execute function public.guard_w04_append_only();

-- =====================================================================
-- PRIVATE HELPERS
-- =====================================================================
create or replace function app_private.w04_traveler_visibility(_type public.journey_event_type)
returns boolean language sql immutable set search_path = 'pg_catalog','public' as $$
  select _type in ('STEP_STARTED','STEP_COMPLETED','GATHERING_STARTED','BOARDING_STARTED',
                   'BOARDING_COMPLETED','DEPARTED','ARRIVED','DISEMBARKATION_COMPLETED',
                   'EXPECTED_TIME_CHANGED')
$$;

create or replace function app_private.w04_default_presence_requirement(_kind public.journey_step_kind)
returns public.step_presence_requirement language sql immutable set search_path = 'pg_catalog','public' as $$
  select case
    when _kind in ('boarding','movement','return') then 'boarded'
    when _kind in ('meeting','arrival','disembarkation') then 'accounted'
    else 'none' end::public.step_presence_requirement
$$;

create or replace function app_private.w04_has_event(_step_id uuid, _type public.journey_event_type)
returns boolean language sql stable security definer set search_path = 'pg_catalog','public' as $$
  select exists (select 1 from public.journey_events e
                 where e.journey_step_id = _step_id and e.event_type = _type)
$$;

-- Operation loader + authorization for runtime commands
create or replace function app_private.w04_operation(_operation_id uuid, _roles text[])
returns public.operations language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _op public.operations;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id, _roles::public.app_role[]) then
    raise exception 'You do not have permission for this operation runtime';
  end if;
  return _op;
end;
$$;

create or replace function app_private.w04_assert_occurred_at(_op public.operations, _occurred_at timestamptz)
returns timestamptz language plpgsql immutable set search_path = 'pg_catalog','public' as $$
declare _at timestamptz := coalesce(_occurred_at, now());
begin
  if _at > now() + interval '5 minutes' then
    raise exception 'An event cannot be recorded in the future';
  end if;
  if _at < _op.planned_start - interval '24 hours' then
    raise exception 'An event cannot be backdated before the operation window';
  end if;
  return _at;
end;
$$;

-- PRIVATE: the only writer of journey_events. Never granted to app roles.
create or replace function app_private.record_journey_event(
  _op public.operations, _step_id uuid, _type public.journey_event_type,
  _occurred_at timestamptz, _note text default null, _context jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _id uuid; _at timestamptz;
begin
  _at := app_private.w04_assert_occurred_at(_op, _occurred_at);
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));

  perform set_config('app.w04_control','on', true);
  insert into public.journey_events
    (tenant_id, operation_id, journey_step_id, event_type, actor_profile_id,
     occurred_at, note, traveler_visible, context, correlation_id)
  values (_op.tenant_id, _op.id, _step_id, _type, auth.uid(), _at,
          nullif(btrim(coalesce(_note,'')),''),
          -- SERVER-CONTROLLED: the client never chooses traveler visibility.
          app_private.w04_traveler_visibility(_type)
            and coalesce((select s.traveler_facing from public.journey_steps s where s.id = _step_id), false),
          coalesce(_context,'{}'::jsonb), gen_random_uuid()::text)
  on conflict do nothing
  returning id into _id;
  perform set_config('app.w04_control','off', true);

  if _id is null then
    select e.id into _id from public.journey_events e
      where e.operation_id = _op.id and e.event_type = _type
        and e.journey_step_id is not distinct from _step_id
      limit 1;
  end if;
  return _id;
end;
$$;

create or replace function app_private.w04_step(_step_id uuid, _roles text[])
returns public.journey_steps language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _step from public.journey_steps s where s.id = _step_id;
  if _step.id is null then raise exception 'Journey step not found'; end if;
  if not app_private.has_tenant_role(_step.tenant_id, _roles::public.app_role[]) then
    raise exception 'You do not have permission for this operation runtime';
  end if;
  return _step;
end;
$$;

-- =====================================================================
-- DERIVATION FUNCTIONS (read-only, no manual readiness anywhere)
-- =====================================================================
create or replace function public.w04_step_readiness(_step_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare
  _step public.journey_steps;
  _satisfying public.presence_fact[];
  _evaluated int := 0;
  _satisfied int := 0;
  _missing_people jsonb := '[]'::jsonb;
  _missing_items jsonb := '[]'::jsonb;
  _checklist_ok boolean;
begin
  _step := app_private.w04_step(_step_id, array['owner','admin','operations_agent']);

  -- BINDING RULE: ABSENCE_NOTED never satisfies readiness.
  _satisfying := case _step.presence_requirement
    when 'boarded' then array['BOARDED','NO_SHOW_CONFIRMED']::public.presence_fact[]
    when 'accounted' then array['PRESENT_AT_MEETING_POINT','BOARDED','DISEMBARKED','NO_SHOW_CONFIRMED']::public.presence_fact[]
    else null end;

  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title) order by i.sequence), '[]'::jsonb)
    into _missing_items
    from public.playbook_items i
    where i.journey_step_id = _step.id and i.is_active and i.requirement = 'required'
      and coalesce((
        select e.execution_action from public.playbook_executions e
          where e.playbook_item_id = i.id
          order by e.recorded_at desc, e.id desc limit 1
      ), 'reopened'::public.playbook_execution_action) <> 'completed';
  _checklist_ok := jsonb_array_length(_missing_items) = 0;

  if _satisfying is null then
    return jsonb_build_object(
      'step_id', _step.id, 'requirement', _step.presence_requirement,
      'population', _step.presence_population, 'evaluated', 0, 'satisfied', 0,
      'missing_participations', '[]'::jsonb, 'missing_required_items', _missing_items,
      'presence_ok', true, 'checklist_ok', _checklist_ok, 'ready', _checklist_ok);
  end if;

  with pop as (
    select p.id, pe.full_name
      from public.operation_participations p
      join public.people pe on pe.id = p.person_id
     where p.operation_id = _step.operation_id
       and p.status = 'confirmed'
       and (_step.presence_population = 'all_confirmed' or p.participation_kind = 'participant')
  ), latest as (
    select distinct on (ev.participation_id) ev.participation_id, ev.presence_fact
      from public.participant_presence_events ev
     where ev.journey_step_id = _step.id
     order by ev.participation_id, ev.occurred_at desc, ev.recorded_at desc, ev.id desc
  )
  select count(*)::int,
         count(*) filter (where l.presence_fact = any(_satisfying))::int,
         coalesce(jsonb_agg(jsonb_build_object(
             'participation_id', pop.id, 'full_name', pop.full_name,
             'latest_fact', l.presence_fact)
           ) filter (where l.presence_fact is null or not (l.presence_fact = any(_satisfying))), '[]'::jsonb)
    into _evaluated, _satisfied, _missing_people
    from pop left join latest l on l.participation_id = pop.id;

  return jsonb_build_object(
    'step_id', _step.id,
    'requirement', _step.presence_requirement,
    'population', _step.presence_population,
    'evaluated', _evaluated,
    'satisfied', _satisfied,
    'missing_participations', _missing_people,
    'missing_required_items', _missing_items,
    'presence_ok', (_evaluated = _satisfied),
    'checklist_ok', _checklist_ok,
    'ready', _checklist_ok and (_evaluated = _satisfied));
end;
$$;

create or replace function public.w04_operation_runtime_state(_operation_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _op public.operations; _current uuid; _next uuid;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);

  select s.id into _current from public.journey_steps s
    join public.journey_events e on e.journey_step_id = s.id and e.event_type = 'STEP_STARTED'
   where s.operation_id = _op.id
     and not exists (select 1 from public.journey_events c
                     where c.journey_step_id = s.id and c.event_type in ('STEP_COMPLETED','STEP_SKIPPED'))
   order by e.occurred_at desc, e.recorded_at desc limit 1;

  select s.id into _next from public.journey_steps s
   where s.operation_id = _op.id
     and s.id is distinct from _current
     and not exists (select 1 from public.journey_events c
                     where c.journey_step_id = s.id
                       and c.event_type in ('STEP_STARTED','STEP_COMPLETED','STEP_SKIPPED'))
   order by s.sequence limit 1;

  return jsonb_build_object(
    'operation_id', _op.id, 'status', _op.status,
    'current_step_id', _current, 'next_step_id', _next,
    'readiness', case when _current is null then null else public.w04_step_readiness(_current) end);
end;
$$;

-- =====================================================================
-- 21 PUBLIC COMMANDS
-- =====================================================================

-- 1
create or replace function public.create_journey_step(
  _operation_id uuid, _title text, _step_kind public.journey_step_kind, _idempotency_key text,
  _description text default null, _planned_start timestamptz default null,
  _planned_end timestamptz default null, _location_label text default null,
  _traveler_label text default null, _traveler_facing boolean default false,
  _presence_requirement public.step_presence_requirement default null,
  _presence_population public.step_presence_population default 'participants')
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _op public.operations; _row public.journey_steps; _seq int; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _op.status not in ('draft','planning') then
    raise exception 'Planned steps can only be added while the operation is still being planned. Use an ad-hoc step instead.';
  end if;
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'journey.step_create' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));
  select coalesce(max(s.sequence), 0) + 10 into _seq from public.journey_steps s where s.operation_id = _op.id;

  perform set_config('app.w04_control','on', true);
  insert into public.journey_steps (tenant_id, operation_id, sequence, title, description, step_kind,
    plan_origin, planned_start, planned_end, location_label, traveler_label, traveler_facing,
    presence_requirement, presence_population, created_by)
  values (_op.tenant_id, _op.id, _seq, btrim(_title), nullif(btrim(coalesce(_description,'')),''), _step_kind,
    'planned', _planned_start, _planned_end, nullif(btrim(coalesce(_location_label,'')),''),
    nullif(btrim(coalesce(_traveler_label,'')),''), coalesce(_traveler_facing,false),
    coalesce(_presence_requirement, app_private.w04_default_presence_requirement(_step_kind)),
    coalesce(_presence_population, 'participants'), auth.uid())
  returning * into _row;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'journey.step_created',
    'journey_step', _row.id, _key,
    jsonb_build_object('operation_id', _op.id, 'sequence', _seq, 'kind', _step_kind, 'plan_origin','planned'));

  _existing := jsonb_build_object('journey_step_id', _row.id, 'sequence', _seq);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, auth.uid(), 'journey.step_create', _key, _existing);
  return _existing;
end;
$$;

-- 2
create or replace function public.create_ad_hoc_journey_step(
  _operation_id uuid, _title text, _step_kind public.journey_step_kind, _reason text, _idempotency_key text,
  _description text default null, _expected_start timestamptz default null,
  _expected_end timestamptz default null, _location_label text default null,
  _traveler_label text default null, _traveler_facing boolean default false,
  _presence_requirement public.step_presence_requirement default null,
  _presence_population public.step_presence_population default 'participants')
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _op public.operations; _row public.journey_steps; _seq int;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _existing jsonb;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _why is null then raise exception 'A reason is required to add a step during the operation'; end if;
  if _op.status in ('completed','cancelled') then
    raise exception 'A % operation no longer accepts new steps', _op.status;
  end if;
  perform app_private.assert_generic_note(_why);
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'journey.step_create_ad_hoc' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  select coalesce(max(s.sequence), 0) + 10 into _seq from public.journey_steps s where s.operation_id = _op.id;

  perform set_config('app.w04_control','on', true);
  insert into public.journey_steps (tenant_id, operation_id, sequence, title, description, step_kind,
    plan_origin, ad_hoc_reason, planned_start, planned_end, expected_start, expected_end,
    location_label, traveler_label, traveler_facing, presence_requirement, presence_population, created_by)
  values (_op.tenant_id, _op.id, _seq, btrim(_title), nullif(btrim(coalesce(_description,'')),''), _step_kind,
    'ad_hoc', _why, null, null, _expected_start, _expected_end,
    nullif(btrim(coalesce(_location_label,'')),''), nullif(btrim(coalesce(_traveler_label,'')),''),
    coalesce(_traveler_facing,false),
    coalesce(_presence_requirement, app_private.w04_default_presence_requirement(_step_kind)),
    coalesce(_presence_population,'participants'), auth.uid())
  returning * into _row;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'journey.step_created_ad_hoc',
    'journey_step', _row.id, _key,
    jsonb_build_object('operation_id', _op.id, 'sequence', _seq, 'kind', _step_kind,
                       'reason', _why, 'operation_status', _op.status));

  _existing := jsonb_build_object('journey_step_id', _row.id, 'sequence', _seq, 'plan_origin','ad_hoc');
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, auth.uid(), 'journey.step_create_ad_hoc', _key, _existing);
  return _existing;
end;
$$;

-- 3
create or replace function public.update_journey_step(
  _journey_step_id uuid, _title text default null, _description text default null,
  _location_label text default null, _traveler_label text default null,
  _traveler_facing boolean default null, _planned_start timestamptz default null,
  _planned_end timestamptz default null,
  _presence_requirement public.step_presence_requirement default null,
  _presence_population public.step_presence_population default null,
  _apply_planned boolean default false)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));

  perform set_config('app.w04_control','on', true);
  update public.journey_steps set
    title = coalesce(nullif(btrim(coalesce(_title,'')),''), title),
    description = case when _description is null then description else nullif(btrim(_description),'') end,
    location_label = case when _location_label is null then location_label else nullif(btrim(_location_label),'') end,
    traveler_label = case when _traveler_label is null then traveler_label else nullif(btrim(_traveler_label),'') end,
    traveler_facing = coalesce(_traveler_facing, traveler_facing),
    presence_requirement = coalesce(_presence_requirement, presence_requirement),
    presence_population = coalesce(_presence_population, presence_population),
    planned_start = case when _apply_planned and plan_origin = 'planned' then _planned_start else planned_start end,
    planned_end = case when _apply_planned and plan_origin = 'planned' then _planned_end else planned_end end
  where id = _step.id;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(_step.tenant_id, auth.uid(), 'journey.step_updated',
    'journey_step', _step.id, null,
    jsonb_build_object('operation_id', _step.operation_id, 'operation_status', _op.status,
                       'planned_changed', coalesce(_apply_planned,false)));
  return jsonb_build_object('journey_step_id', _step.id);
end;
$$;

-- 4
create or replace function public.reorder_journey_steps(_operation_id uuid, _step_ids uuid[])
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _op public.operations; _id uuid; _i int := 0; _count int;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);
  if _op.status not in ('draft','planning') then
    raise exception 'The journey baseline is frozen from "ready" onward and cannot be reordered';
  end if;
  select count(*) into _count from public.journey_steps s where s.operation_id = _op.id;
  if _count <> coalesce(array_length(_step_ids,1),0) then
    raise exception 'The reorder request must contain every step of this operation exactly once';
  end if;

  perform set_config('app.w04_control','on', true);
  update public.journey_steps set sequence = -sequence where operation_id = _op.id;
  foreach _id in array _step_ids loop
    _i := _i + 10;
    update public.journey_steps set sequence = _i where id = _id and operation_id = _op.id;
  end loop;
  perform set_config('app.w04_control','off', true);

  if exists (select 1 from public.journey_steps s where s.operation_id = _op.id and s.sequence < 0) then
    raise exception 'The reorder request must contain every step of this operation exactly once';
  end if;

  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'journey.steps_reordered',
    'operation', _op.id, null, jsonb_build_object('steps', array_length(_step_ids,1)));
  return jsonb_build_object('operation_id', _op.id, 'steps', array_length(_step_ids,1));
end;
$$;

-- 5
create or replace function public.set_step_expected_window(
  _journey_step_id uuid, _expected_start timestamptz, _expected_end timestamptz, _reason text)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations; _why text := nullif(btrim(coalesce(_reason,'')),'');
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  if _why is null then raise exception 'A reason is required to change the forecast'; end if;
  if _expected_start is not null and _expected_end is not null and _expected_end < _expected_start then
    raise exception 'Invalid expected window';
  end if;
  if _op.status in ('completed','cancelled') then
    raise exception 'A % operation no longer has a forecast', _op.status;
  end if;
  perform app_private.assert_generic_note(_why);

  perform set_config('app.w04_control','on', true);
  update public.journey_steps
    set expected_start = _expected_start, expected_end = _expected_end
    where id = _step.id;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_journey_event(_op, _step.id, 'EXPECTED_TIME_CHANGED', now(), null,
    jsonb_build_object('previous_expected_start', _step.expected_start,
                       'previous_expected_end', _step.expected_end,
                       'new_expected_start', _expected_start, 'new_expected_end', _expected_end,
                       'reason', _why));
  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'journey.step_expected_time_changed',
    'journey_step', _step.id, null,
    jsonb_build_object('previous_expected_start', _step.expected_start,
                       'previous_expected_end', _step.expected_end,
                       'new_expected_start', _expected_start, 'new_expected_end', _expected_end,
                       'reason', _why));
  return jsonb_build_object('journey_step_id', _step.id,
    'expected_start', _expected_start, 'expected_end', _expected_end);
end;
$$;

-- 6
create or replace function public.create_playbook_item(
  _journey_step_id uuid, _title text, _idempotency_key text,
  _description text default null, _item_kind public.playbook_item_kind default 'check',
  _requirement public.playbook_requirement default 'required',
  _owner_role_type_id uuid default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _row public.playbook_items; _seq int;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'playbook.item_create' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));
  if _owner_role_type_id is not null and not exists (
      select 1 from public.operation_role_types rt
      where rt.id = _owner_role_type_id and rt.tenant_id = _step.tenant_id) then
    raise exception 'Role not available in this organization';
  end if;

  select coalesce(max(i.sequence),0) + 10 into _seq from public.playbook_items i
    where i.journey_step_id = _step.id;

  perform set_config('app.w04_control','on', true);
  insert into public.playbook_items (tenant_id, operation_id, journey_step_id, title, description,
    item_kind, requirement, owner_role_type_id, sequence, created_by)
  values (_step.tenant_id, _step.operation_id, _step.id, btrim(_title),
    nullif(btrim(coalesce(_description,'')),''), coalesce(_item_kind,'check'),
    coalesce(_requirement,'required'), _owner_role_type_id, _seq, auth.uid())
  returning * into _row;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(_step.tenant_id, auth.uid(), 'playbook.item_created',
    'playbook_item', _row.id, _key,
    jsonb_build_object('journey_step_id', _step.id, 'requirement', _row.requirement));

  _existing := jsonb_build_object('playbook_item_id', _row.id);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_step.tenant_id, auth.uid(), 'playbook.item_create', _key, _existing);
  return _existing;
end;
$$;

-- 7
create or replace function public.update_playbook_item(
  _playbook_item_id uuid, _title text default null, _description text default null,
  _item_kind public.playbook_item_kind default null,
  _requirement public.playbook_requirement default null,
  _owner_role_type_id uuid default null, _is_active boolean default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _row public.playbook_items;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _row from public.playbook_items i where i.id = _playbook_item_id;
  if _row.id is null then raise exception 'Checklist item not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission for this operation runtime';
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));

  perform set_config('app.w04_control','on', true);
  update public.playbook_items set
    title = coalesce(nullif(btrim(coalesce(_title,'')),''), title),
    description = case when _description is null then description else nullif(btrim(_description),'') end,
    item_kind = coalesce(_item_kind, item_kind),
    requirement = coalesce(_requirement, requirement),
    owner_role_type_id = coalesce(_owner_role_type_id, owner_role_type_id),
    is_active = coalesce(_is_active, is_active)
  where id = _row.id;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'playbook.item_updated',
    'playbook_item', _row.id, null, jsonb_build_object('journey_step_id', _row.journey_step_id));
  return jsonb_build_object('playbook_item_id', _row.id);
end;
$$;

-- private: shared playbook execution writer
create or replace function app_private.w04_playbook_execute(
  _playbook_item_id uuid, _action public.playbook_execution_action, _note text)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _row public.playbook_items; _op public.operations; _latest public.playbook_execution_action; _id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _row from public.playbook_items i where i.id = _playbook_item_id;
  if _row.id is null then raise exception 'Checklist item not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission for this operation runtime';
  end if;
  select * into _op from public.operations o where o.id = _row.operation_id;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));

  select e.execution_action into _latest from public.playbook_executions e
    where e.playbook_item_id = _row.id order by e.recorded_at desc, e.id desc limit 1;
  if _latest is not distinct from _action then
    -- IDEMPOTENT: a retry / double tap does not append a duplicate fact.
    return jsonb_build_object('playbook_item_id', _row.id, 'state', _action, 'unchanged', true);
  end if;

  perform set_config('app.w04_control','on', true);
  insert into public.playbook_executions (tenant_id, operation_id, playbook_item_id, journey_step_id,
    execution_action, actor_profile_id, occurred_at, note, correlation_id)
  values (_row.tenant_id, _row.operation_id, _row.id, _row.journey_step_id, _action, auth.uid(), now(),
    nullif(btrim(coalesce(_note,'')),''), gen_random_uuid()::text)
  returning id into _id;
  perform set_config('app.w04_control','off', true);

  return jsonb_build_object('playbook_item_id', _row.id, 'execution_id', _id, 'state', _action);
end;
$$;

-- 8
create or replace function public.complete_playbook_item(_playbook_item_id uuid, _note text default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
begin
  return app_private.w04_playbook_execute(_playbook_item_id, 'completed', _note);
end;
$$;

-- 9
create or replace function public.reopen_playbook_item(_playbook_item_id uuid, _reason text)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
begin
  if nullif(btrim(coalesce(_reason,'')),'') is null then
    raise exception 'A reason is required to reopen a checklist item';
  end if;
  return app_private.w04_playbook_execute(_playbook_item_id, 'reopened', _reason);
end;
$$;

-- 10
create or replace function public.record_presence_fact(
  _participation_id uuid, _journey_step_id uuid, _presence_fact public.presence_fact,
  _occurred_at timestamptz default null, _note text default null, _reason text default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _part public.operation_participations; _step public.journey_steps; _op public.operations;
  _at timestamptz; _id uuid; _why text := nullif(btrim(coalesce(_reason,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _part from public.operation_participations p where p.id = _participation_id;
  if _part.id is null then raise exception 'Participation not found'; end if;
  if not app_private.has_tenant_role(_part.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission for this operation runtime';
  end if;
  select * into _step from public.journey_steps s where s.id = _journey_step_id;
  if _step.id is null then raise exception 'Journey step not found'; end if;
  if _step.operation_id <> _part.operation_id or _step.tenant_id <> _part.tenant_id then
    raise exception 'That step does not belong to this participation''s operation';
  end if;
  select * into _op from public.operations o where o.id = _part.operation_id;
  if _op.status not in ('ready','active') then
    raise exception 'Presence can only be recorded while the operation is ready or running';
  end if;

  if _presence_fact = 'NO_SHOW_CONFIRMED' then
    if not app_private.has_tenant_role(_part.tenant_id, array['owner','admin']::public.app_role[]) then
      raise exception 'Only owners and admins can confirm a no-show';
    end if;
    if _why is null then raise exception 'A reason is required to confirm a no-show'; end if;
  end if;
  if _presence_fact = 'BOARDED' then
    if _step.presence_requirement = 'none' then
      raise exception 'This step does not track boarding';
    end if;
    if not app_private.w04_has_event(_step.id, 'BOARDING_STARTED') then
      raise exception 'Boarding has not started for this step yet';
    end if;
  end if;
  if _presence_fact = 'DISEMBARKED' and not app_private.w04_has_event(_step.id, 'ARRIVED') then
    raise exception 'The group has not arrived for this step yet';
  end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));
  perform app_private.assert_generic_note(_why);
  _at := app_private.w04_assert_occurred_at(_op, _occurred_at);

  perform set_config('app.w04_control','on', true);
  insert into public.participant_presence_events (tenant_id, operation_id, participation_id,
    journey_step_id, presence_fact, actor_profile_id, occurred_at, note, context, correlation_id)
  values (_part.tenant_id, _part.operation_id, _part.id, _step.id, _presence_fact, auth.uid(), _at,
    coalesce(nullif(btrim(coalesce(_note,'')),''), _why),
    case when _why is null then '{}'::jsonb else jsonb_build_object('reason', _why) end,
    gen_random_uuid()::text)
  on conflict do nothing
  returning id into _id;
  perform set_config('app.w04_control','off', true);

  if _presence_fact = 'NO_SHOW_CONFIRMED' then
    perform app_private.record_audit_event(_part.tenant_id, auth.uid(), 'presence.no_show_confirmed',
      'operation_participation', _part.id, null,
      jsonb_build_object('operation_id', _part.operation_id, 'journey_step_id', _step.id, 'reason', _why));
  end if;

  -- W03 roster status is deliberately NOT touched here.
  return jsonb_build_object('participation_id', _part.id, 'journey_step_id', _step.id,
    'presence_fact', _presence_fact, 'presence_event_id', _id, 'replayed', (_id is null));
end;
$$;

-- private: shared milestone writer with transition matrix
create or replace function app_private.w04_milestone(
  _journey_step_id uuid, _type public.journey_event_type, _occurred_at timestamptz,
  _note text default null, _context jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations; _id uuid;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  if _op.status not in ('ready','active') then
    raise exception 'Runtime facts can only be recorded on a ready or running operation';
  end if;
  if not app_private.w04_has_event(_step.id, 'STEP_STARTED') then
    raise exception 'This step has not started yet';
  end if;
  if app_private.w04_has_event(_step.id, 'STEP_COMPLETED')
     or app_private.w04_has_event(_step.id, 'STEP_SKIPPED') then
    raise exception 'This step is already closed';
  end if;
  _id := app_private.record_journey_event(_op, _step.id, _type, _occurred_at, _note, _context);
  return jsonb_build_object('journey_step_id', _step.id, 'event_type', _type, 'journey_event_id', _id);
end;
$$;

-- 11
create or replace function public.start_journey_step(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations; _open uuid; _id uuid;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  if _op.status not in ('ready','active') then
    raise exception 'The operation must be ready before the journey can start';
  end if;
  if app_private.w04_has_event(_step.id, 'STEP_STARTED') then
    return jsonb_build_object('journey_step_id', _step.id, 'unchanged', true);
  end if;
  if app_private.w04_has_event(_step.id, 'STEP_SKIPPED') then
    raise exception 'This step was skipped and cannot be started';
  end if;
  select s.id into _open from public.journey_steps s
    where s.operation_id = _op.id
      and app_private.w04_has_event(s.id, 'STEP_STARTED')
      and not app_private.w04_has_event(s.id, 'STEP_COMPLETED')
      and not app_private.w04_has_event(s.id, 'STEP_SKIPPED')
    limit 1;
  if _open is not null then
    raise exception 'Another step is still running. Finish it before starting a new one.';
  end if;

  -- W02 owns the lifecycle: promotion goes through the canonical command.
  if _op.status = 'ready' then
    perform public.set_operation_status(_op.id, 'active', 'Journey runtime started');
    select * into _op from public.operations o where o.id = _step.operation_id;
  end if;

  _id := app_private.record_journey_event(_op, _step.id, 'STEP_STARTED', _occurred_at);
  return jsonb_build_object('journey_step_id', _step.id, 'journey_event_id', _id, 'operation_status', _op.status);
end;
$$;

-- 12
create or replace function public.complete_journey_step(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations; _id uuid;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  if not app_private.w04_has_event(_step.id, 'STEP_STARTED') then
    raise exception 'This step has not started yet';
  end if;
  if app_private.w04_has_event(_step.id, 'STEP_COMPLETED') then
    return jsonb_build_object('journey_step_id', _step.id, 'unchanged', true);
  end if;
  _id := app_private.record_journey_event(_op, _step.id, 'STEP_COMPLETED', _occurred_at);
  -- The operation is NOT auto-completed; W02 completion stays human-authorized.
  return jsonb_build_object('journey_step_id', _step.id, 'journey_event_id', _id);
end;
$$;

-- 13
create or replace function public.skip_journey_step(_journey_step_id uuid, _reason text)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations; _why text := nullif(btrim(coalesce(_reason,'')),''); _id uuid;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  if _why is null then raise exception 'A reason is required to skip a step'; end if;
  if app_private.w04_has_event(_step.id, 'STEP_STARTED') then
    raise exception 'A step that already started cannot be skipped';
  end if;
  if app_private.w04_has_event(_step.id, 'STEP_SKIPPED') then
    return jsonb_build_object('journey_step_id', _step.id, 'unchanged', true);
  end if;
  perform app_private.assert_generic_note(_why);
  _id := app_private.record_journey_event(_op, _step.id, 'STEP_SKIPPED', now(), _why);
  perform app_private.record_audit_event(_step.tenant_id, auth.uid(), 'journey.step_skipped',
    'journey_step', _step.id, null, jsonb_build_object('operation_id', _op.id, 'reason', _why));
  return jsonb_build_object('journey_step_id', _step.id, 'journey_event_id', _id);
end;
$$;

-- 14
create or replace function public.start_gathering(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
begin
  return app_private.w04_milestone(_journey_step_id, 'GATHERING_STARTED', _occurred_at);
end;
$$;

-- 15
create or replace function public.start_boarding(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  if _step.presence_requirement = 'none' then
    raise exception 'This step does not track boarding';
  end if;
  return app_private.w04_milestone(_journey_step_id, 'BOARDING_STARTED', _occurred_at);
end;
$$;

-- 16
create or replace function public.complete_boarding(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
begin
  if not app_private.w04_has_event(_journey_step_id, 'BOARDING_STARTED') then
    raise exception 'Boarding has not started for this step yet';
  end if;
  return app_private.w04_milestone(_journey_step_id, 'BOARDING_COMPLETED', _occurred_at);
end;
$$;

-- 17
create or replace function public.authorize_departure(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations; _readiness jsonb; _id uuid;
begin
  -- PRIVILEGED HUMAN DECISION: owner/admin only. No W03 role key grants this.
  _step := app_private.w04_step(_journey_step_id, array['owner','admin']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  if _op.status <> 'active' then
    raise exception 'Departure can only be authorized on a running operation';
  end if;
  if not app_private.w04_has_event(_step.id, 'STEP_STARTED') then
    raise exception 'This step has not started yet';
  end if;
  if app_private.w04_has_event(_step.id, 'DEPARTURE_AUTHORIZED') then
    return jsonb_build_object('journey_step_id', _step.id, 'unchanged', true);
  end if;

  _readiness := public.w04_step_readiness(_step.id);
  if not (_readiness ->> 'ready')::boolean then
    raise exception 'This step is not ready yet: % checklist item(s) and % person(s) pending',
      jsonb_array_length(_readiness -> 'missing_required_items'),
      jsonb_array_length(_readiness -> 'missing_participations');
  end if;

  _id := app_private.record_journey_event(_op, _step.id, 'DEPARTURE_AUTHORIZED', _occurred_at, null,
    jsonb_build_object('evaluated', _readiness -> 'evaluated', 'satisfied', _readiness -> 'satisfied',
                       'population', _readiness -> 'population', 'requirement', _readiness -> 'requirement'));
  perform app_private.record_audit_event(_step.tenant_id, auth.uid(), 'journey.departure_authorized',
    'journey_step', _step.id, null,
    jsonb_build_object('operation_id', _op.id, 'readiness', _readiness));
  return jsonb_build_object('journey_step_id', _step.id, 'journey_event_id', _id, 'readiness', _readiness);
end;
$$;

-- 18
create or replace function public.record_departed(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
begin
  if not app_private.w04_has_event(_journey_step_id, 'DEPARTURE_AUTHORIZED') then
    raise exception 'Departure has not been authorized for this step';
  end if;
  return app_private.w04_milestone(_journey_step_id, 'DEPARTED', _occurred_at);
end;
$$;

-- 19
create or replace function public.record_arrival(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
begin
  if not app_private.w04_has_event(_journey_step_id, 'DEPARTED') then
    raise exception 'The group has not departed for this step';
  end if;
  return app_private.w04_milestone(_journey_step_id, 'ARRIVED', _occurred_at);
end;
$$;

-- 20
create or replace function public.complete_disembarkation(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
begin
  if not app_private.w04_has_event(_journey_step_id, 'ARRIVED') then
    raise exception 'The group has not arrived for this step';
  end if;
  return app_private.w04_milestone(_journey_step_id, 'DISEMBARKATION_COMPLETED', _occurred_at);
end;
$$;

-- 21
create or replace function public.note_incident(
  _operation_id uuid, _note text, _journey_step_id uuid default null,
  _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _op public.operations; _clean text := nullif(btrim(coalesce(_note,'')),''); _id uuid;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);
  if _clean is null then raise exception 'An incident note is required'; end if;
  if length(_clean) > 500 then raise exception 'Keep the incident note short and factual'; end if;
  if _journey_step_id is not null and not exists (
      select 1 from public.journey_steps s where s.id = _journey_step_id and s.operation_id = _op.id) then
    raise exception 'That step does not belong to this operation';
  end if;
  -- Defense in depth only; policy forbids medical/ID/financial content in this note.
  perform app_private.assert_generic_note(_clean);

  -- INCIDENT_NOTED is internal by construction (see app_private.w04_traveler_visibility).
  _id := app_private.record_journey_event(_op, _journey_step_id, 'INCIDENT_NOTED', _occurred_at, _clean);
  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'journey.incident_noted',
    'operation', _op.id, null, jsonb_build_object('journey_step_id', _journey_step_id));
  return jsonb_build_object('operation_id', _op.id, 'journey_event_id', _id);
end;
$$;

-- =====================================================================
-- EXECUTE PRIVILEGES — anon has zero W04 surface, private helpers stay private
-- =====================================================================
do $$
declare _f record;
begin
  for _f in
    select p.oid::regprocedure::text as sig, n.nspname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'app_private')
        or (n.nspname = 'public' and p.proname in (
            'create_journey_step','create_ad_hoc_journey_step','update_journey_step',
            'reorder_journey_steps','set_step_expected_window','create_playbook_item',
            'update_playbook_item','complete_playbook_item','reopen_playbook_item',
            'record_presence_fact','start_journey_step','complete_journey_step',
            'skip_journey_step','start_gathering','start_boarding','complete_boarding',
            'authorize_departure','record_departed','record_arrival',
            'complete_disembarkation','note_incident',
            'w04_step_readiness','w04_operation_runtime_state'))
  loop
    execute format('revoke all on function %s from public, anon', _f.sig);
    if _f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated, service_role', _f.sig);
    else
      execute format('grant execute on function %s to service_role', _f.sig);
    end if;
  end loop;
end $$;

-- =====================================================================
-- REALTIME — exactly four operation-scoped runtime tables
-- =====================================================================
alter table public.journey_steps replica identity full;
alter table public.journey_events replica identity full;
alter table public.participant_presence_events replica identity full;
alter table public.playbook_executions replica identity full;

alter publication supabase_realtime add table public.journey_steps;
alter publication supabase_realtime add table public.journey_events;
alter publication supabase_realtime add table public.participant_presence_events;
alter publication supabase_realtime add table public.playbook_executions;
