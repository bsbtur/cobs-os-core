-- =====================================================================
-- COBS OS · W07 EVENT PRODUCTION CORE — FOUNDATION (additive)
-- =====================================================================

create type public.event_lifecycle_status as enum
  ('draft','planning','program_locked','ready','closed_out');

create type public.event_source_kind as enum ('internal','external');

create type public.event_session_kind as enum
  ('keynote','talk','panel','workshop','ceremony','performance','rehearsal',
   'setup','teardown','break','meal','networking','other');

create type public.event_staff_function as enum
  ('producer','coordinator','stage_manager','technician','audio','lighting',
   'video','photography','host','support','logistics','security','other');

create type public.event_runtime_event_type as enum
  ('EVENT_STARTED','EVENT_COMPLETED','EVENT_CANCELLED','EVENT_EXPECTED_TIME_CHANGED',
   'SESSION_STARTED','SESSION_PAUSED','SESSION_RESUMED','SESSION_COMPLETED',
   'SESSION_CANCELLED','SESSION_EXPECTED_TIME_CHANGED','SESSION_SPACE_CHANGED',
   'EVENT_NOTE_RECORDED');

-- ------------------------------------------------------------------ venues
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  country_code char(2),
  region text,
  city text,
  address_label text,
  timezone text,
  contact_label text,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create index venues_tenant_idx on public.venues (tenant_id, is_active, name);

-- ----------------------------------------------------------- venue_spaces
create table public.venue_spaces (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venue_id uuid not null,
  name text not null,
  space_label text,
  planning_capacity integer check (planning_capacity is null or planning_capacity >= 0),
  floor_label text,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, venue_id) references public.venues (tenant_id, id) on delete cascade
);
create index venue_spaces_venue_idx on public.venue_spaces (tenant_id, venue_id, is_active);

-- ----------------------------------------------------------------- events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  venue_id uuid,
  journey_step_id uuid,
  name text not null,
  source_kind public.event_source_kind not null,
  external_producer_name text,
  status public.event_lifecycle_status not null default 'draft',
  timezone text not null,
  planned_start timestamptz not null,
  planned_end timestamptz not null,
  expected_start timestamptz,
  expected_end timestamptz,
  notes text,
  closed_out_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint events_planned_window_ck check (planned_end > planned_start),
  constraint events_external_producer_ck check (
    source_kind = 'internal' or nullif(btrim(coalesce(external_producer_name,'')),'') is not null),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, venue_id) references public.venues (tenant_id, id),
  foreign key (tenant_id, journey_step_id) references public.journey_steps (tenant_id, id)
);
create index events_operation_idx on public.events (tenant_id, operation_id, planned_start);
create index events_status_idx on public.events (tenant_id, status);

-- --------------------------------------------------------- event_sessions
create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  venue_space_id uuid,
  sequence integer not null,
  title text not null,
  description text,
  session_kind public.event_session_kind not null default 'talk',
  is_ad_hoc boolean not null default false,
  ad_hoc_reason text,
  planned_start timestamptz,
  planned_end timestamptz,
  expected_start timestamptz,
  expected_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (event_id, id),
  constraint event_sessions_sequence_uq unique (event_id, sequence) deferrable initially deferred,
  constraint event_sessions_adhoc_reason_ck check (
    not is_ad_hoc or nullif(btrim(coalesce(ad_hoc_reason,'')),'') is not null),
  constraint event_sessions_planned_ck check (
    planned_start is null or planned_end is null or planned_end > planned_start),
  foreign key (tenant_id, event_id) references public.events (tenant_id, id) on delete cascade,
  foreign key (tenant_id, venue_space_id) references public.venue_spaces (tenant_id, id)
);
create index event_sessions_event_idx on public.event_sessions (tenant_id, event_id, sequence);

-- -------------------------------------------------- event_session_speakers
create table public.event_session_speakers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  session_id uuid not null,
  person_id uuid not null,
  speaking_role text,
  presentation_title text,
  sort_order integer not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, person_id),
  foreign key (tenant_id, event_id) references public.events (tenant_id, id) on delete cascade,
  foreign key (event_id, session_id) references public.event_sessions (event_id, id) on delete cascade,
  foreign key (tenant_id, session_id) references public.event_sessions (tenant_id, id) on delete cascade,
  foreign key (tenant_id, person_id) references public.people (tenant_id, id) on delete cascade
);
create index event_session_speakers_session_idx
  on public.event_session_speakers (tenant_id, session_id, sort_order);

-- ------------------------------------------------- event_staff_assignments
create table public.event_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null,
  session_id uuid,
  venue_space_id uuid,
  person_id uuid not null,
  staff_function public.event_staff_function not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, event_id) references public.events (tenant_id, id) on delete cascade,
  foreign key (event_id, session_id) references public.event_sessions (event_id, id) on delete cascade,
  foreign key (tenant_id, venue_space_id) references public.venue_spaces (tenant_id, id),
  foreign key (tenant_id, person_id) references public.people (tenant_id, id) on delete cascade
);
create unique index event_staff_assignments_uq
  on public.event_staff_assignments
     (event_id, person_id, staff_function,
      coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(venue_space_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index event_staff_assignments_event_idx
  on public.event_staff_assignments (tenant_id, event_id, staff_function);

-- --------------------------------------------------- event_runtime_events
create table public.event_runtime_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  event_id uuid not null,
  session_id uuid,
  venue_space_id uuid,
  event_type public.event_runtime_event_type not null,
  actor_profile_id uuid references public.profiles(id),
  observed boolean not null default false,
  observed_at timestamptz,
  observer_note text,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  note text,
  context jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint event_runtime_observed_ck check (
    not observed or (observed_at is not null
      and nullif(btrim(coalesce(observer_note,'')),'') is not null)),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, event_id) references public.events (tenant_id, id) on delete cascade,
  foreign key (event_id, session_id) references public.event_sessions (event_id, id) on delete cascade,
  foreign key (tenant_id, venue_space_id) references public.venue_spaces (tenant_id, id)
);
create index event_runtime_events_event_idx
  on public.event_runtime_events (tenant_id, event_id, occurred_at desc);
create index event_runtime_events_session_idx
  on public.event_runtime_events (tenant_id, session_id, occurred_at desc);

-- Semantic singularity across actors (not solved in the UI).
create unique index event_runtime_started_uq
  on public.event_runtime_events (event_id) where event_type = 'EVENT_STARTED';
create unique index event_runtime_event_terminal_uq
  on public.event_runtime_events (event_id)
  where event_type in ('EVENT_COMPLETED','EVENT_CANCELLED');
create unique index event_runtime_session_started_uq
  on public.event_runtime_events (session_id) where event_type = 'SESSION_STARTED';
create unique index event_runtime_session_terminal_uq
  on public.event_runtime_events (session_id)
  where event_type in ('SESSION_COMPLETED','SESSION_CANCELLED');

-- ============================================================ PRIVATE HELPERS
create or replace function app_private.w07_require_event_write(_event_id uuid)
returns public.events language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.events;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _row from public.events e where e.id = _event_id;
  if _row.id is null then raise exception 'Event not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id,
       array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission for event production in this organization';
  end if;
  return _row;
end; $$;

create or replace function app_private.w07_assert_event_non_terminal(_event public.events)
returns void language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
begin
  if _event.status = 'closed_out' then
    raise exception 'This event is closed and can no longer be changed';
  end if;
end; $$;

create or replace function app_private.w07_require_event_runtime_write(_event_id uuid)
returns public.events language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.events;
begin
  _row := app_private.w07_require_event_write(_event_id);
  perform app_private.w07_assert_event_non_terminal(_row);
  return _row;
end; $$;

create or replace function app_private.w07_assert_event_internal(_event public.events)
returns void language plpgsql immutable
set search_path to 'pg_catalog','public' as $$
begin
  if _event.source_kind <> 'internal' then
    raise exception 'This event is produced by an external producer; only observation is allowed';
  end if;
end; $$;

create or replace function app_private.w07_assert_event_external(_event public.events)
returns void language plpgsql immutable
set search_path to 'pg_catalog','public' as $$
begin
  if _event.source_kind <> 'external' then
    raise exception 'Observation commands only apply to externally produced events';
  end if;
end; $$;

create or replace function app_private.w07_assert_program_unlocked(_event public.events)
returns void language plpgsql immutable
set search_path to 'pg_catalog','public' as $$
begin
  if _event.status not in ('draft','planning') then
    raise exception 'The program baseline is locked and can no longer be rewritten';
  end if;
end; $$;

create or replace function app_private.w07_assert_program_locked(_event public.events)
returns void language plpgsql immutable
set search_path to 'pg_catalog','public' as $$
begin
  if _event.status not in ('program_locked','ready') then
    raise exception 'The program must be locked before this action';
  end if;
end; $$;

create or replace function app_private.w07_derived_event_runtime_state(_event_id uuid)
returns text language sql stable security definer
set search_path to 'pg_catalog','public' as $$
  select case
    when exists (select 1 from public.event_runtime_events r
                  where r.event_id = _event_id and r.event_type = 'EVENT_CANCELLED') then 'cancelled'
    when exists (select 1 from public.event_runtime_events r
                  where r.event_id = _event_id and r.event_type = 'EVENT_COMPLETED') then 'completed'
    when exists (select 1 from public.event_runtime_events r
                  where r.event_id = _event_id and r.event_type = 'EVENT_STARTED') then 'running'
    else 'scheduled' end
$$;

create or replace function app_private.w07_derived_session_runtime_state(_session_id uuid)
returns text language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _last public.event_runtime_event_type;
begin
  if _session_id is null then return 'scheduled'; end if;
  if exists (select 1 from public.event_runtime_events r
              where r.session_id = _session_id and r.event_type = 'SESSION_CANCELLED')
    then return 'cancelled'; end if;
  if exists (select 1 from public.event_runtime_events r
              where r.session_id = _session_id and r.event_type = 'SESSION_COMPLETED')
    then return 'completed'; end if;
  select r.event_type into _last from public.event_runtime_events r
   where r.session_id = _session_id
     and r.event_type in ('SESSION_STARTED','SESSION_PAUSED','SESSION_RESUMED')
   order by r.occurred_at desc, r.recorded_at desc, r.created_at desc limit 1;
  if _last is null then return 'scheduled'; end if;
  if _last = 'SESSION_PAUSED' then return 'paused'; end if;
  return 'running';
end; $$;

create or replace function app_private.w07_assert_session_in_event(_session_id uuid, _event_id uuid)
returns public.event_sessions language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.event_sessions;
begin
  select * into _row from public.event_sessions s
   where s.id = _session_id and s.event_id = _event_id;
  if _row.id is null then raise exception 'Session not found in this event'; end if;
  return _row;
end; $$;

create or replace function app_private.w07_next_session_sequence(_event_id uuid)
returns integer language sql stable security definer
set search_path to 'pg_catalog','public' as $$
  select coalesce(max(s.sequence), 0) + 1 from public.event_sessions s where s.event_id = _event_id
$$;

create or replace function app_private.w07_record_runtime_event(
  _event public.events,
  _type public.event_runtime_event_type,
  _session_id uuid default null,
  _venue_space_id uuid default null,
  _occurred_at timestamptz default null,
  _observed boolean default false,
  _observed_at timestamptz default null,
  _observer_note text default null,
  _note text default null,
  _context jsonb default '{}'::jsonb,
  _correlation_id text default null)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _id uuid; _at timestamptz := coalesce(_occurred_at, _observed_at, now());
begin
  if _at > now() + interval '5 minutes' then
    raise exception 'An event production fact cannot be recorded in the future';
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_observer_note,'')),''));

  perform set_config('app.w07_control','on', true);
  insert into public.event_runtime_events
    (tenant_id, operation_id, event_id, session_id, venue_space_id, event_type,
     actor_profile_id, observed, observed_at, observer_note, occurred_at, note,
     context, correlation_id)
  values (_event.tenant_id, _event.operation_id, _event.id, _session_id, _venue_space_id, _type,
          auth.uid(), coalesce(_observed,false), _observed_at,
          nullif(btrim(coalesce(_observer_note,'')),''), _at,
          nullif(btrim(coalesce(_note,'')),''), coalesce(_context,'{}'::jsonb),
          coalesce(nullif(btrim(coalesce(_correlation_id,'')),''), gen_random_uuid()::text))
  returning id into _id;
  perform set_config('app.w07_control','off', true);
  return _id;
end; $$;

create or replace function app_private.w07_close_out_event(_event_id uuid)
returns void language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
begin
  perform set_config('app.w07_control','on', true);
  update public.events set status = 'closed_out', closed_out_at = now() where id = _event_id;
  perform set_config('app.w07_control','off', true);
end; $$;

-- ============================================================ GUARD TRIGGERS
create or replace function public.guard_w07_mutation()
returns trigger language plpgsql
set search_path to 'pg_catalog','public' as $$
begin
  if coalesce(current_setting('app.w07_control', true), 'off') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Event production data can only change through the approved commands';
end; $$;

create or replace function public.guard_w07_append_only()
returns trigger language plpgsql
set search_path to 'pg_catalog','public' as $$
begin
  raise exception '% is append-only', tg_table_name;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['venues','venue_spaces','events','event_sessions',
                           'event_session_speakers','event_staff_assignments'] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.guard_w07_mutation()',
      'guard_' || t || '_w07', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
      'set_' || t || '_updated_at', t);
  end loop;
end $$;

create trigger guard_event_runtime_events_insert
  before insert on public.event_runtime_events
  for each row execute function public.guard_w07_mutation();
create trigger guard_event_runtime_events_append_only
  before update or delete on public.event_runtime_events
  for each row execute function public.guard_w07_append_only();

-- ==================================================================== RLS
do $$
declare t text;
begin
  foreach t in array array['venues','venue_spaces','events','event_sessions',
                           'event_session_speakers','event_staff_assignments',
                           'event_runtime_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy "Elevated roles read %s" on public.%I for select to authenticated
         using (app_private.has_tenant_role(tenant_id,
                array[''owner'',''admin'',''operations_agent'']::public.app_role[]))', t, t);
    execute format('revoke all on public.%I from public', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ============================================== PRIVATE HELPER EXECUTE ACLs
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_private' and p.proname like 'w07\_%' loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('revoke all on function %s from authenticated', f.sig);
  end loop;
end $$;

revoke all on function public.guard_w07_mutation() from public, anon, authenticated;
revoke all on function public.guard_w07_append_only() from public, anon, authenticated;

-- =============================================================== REALTIME
alter publication supabase_realtime add table public.event_runtime_events;
alter publication supabase_realtime add table public.event_sessions;
alter table public.event_runtime_events replica identity full;
alter table public.event_sessions replica identity full;