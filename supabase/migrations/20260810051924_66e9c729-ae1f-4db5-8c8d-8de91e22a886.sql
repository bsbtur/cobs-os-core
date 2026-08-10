-- =====================================================================
-- COBS OS · W05 — MOBILITY CORE (vehicles · drivers · legs · dispatch · seats)
-- Additive only. W01/W02/W03/W04 semantics untouched.
-- =====================================================================

-- ---------- 4 ENUMS ----------
create type public.transport_vehicle_kind as enum
  ('bus','minibus','van','car','boat','shuttle','other');

create type public.transport_leg_kind as enum
  ('outbound','transfer','shuttle','return','other');

create type public.transport_event_type as enum (
  'LEG_CREATED','VEHICLE_REQUESTED','VEHICLE_ASSIGNED','DRIVER_ASSIGNED',
  'ASSIGNMENT_CHANGED','ASSIGNMENT_CLEARED','VEHICLE_EN_ROUTE_TO_PICKUP',
  'VEHICLE_AT_PICKUP','LEG_DEPARTED','STOP_REACHED','DESTINATION_ARRIVED',
  'LEG_CANCELLED','RETURN_TIME_SET','EXPECTED_TIME_CHANGED',
  'SEAT_ASSIGNED','SEAT_RELEASED','TRANSPORT_INCIDENT_NOTED');

-- Derived only. Never stored in a column.
create type public.transport_dispatch_state as enum (
  'planned','requested','assigned','en_route_to_pickup','at_pickup',
  'in_transit','arrived','cancelled');

-- =====================================================================
-- 1. vehicles
-- =====================================================================
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null,
  vehicle_kind public.transport_vehicle_kind not null default 'bus',
  identifier text,
  capacity integer,
  operator_name text,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_id_tenant_key unique (id, tenant_id),
  constraint vehicles_capacity_positive check (capacity is null or capacity > 0)
);
create unique index vehicles_tenant_identifier_key
  on public.vehicles (tenant_id, lower(identifier)) where identifier is not null;
create index vehicles_tenant_idx on public.vehicles (tenant_id, is_active);

grant select on public.vehicles to authenticated;
grant all on public.vehicles to service_role;
alter table public.vehicles enable row level security;
create policy "Elevated roles read vehicles" on public.vehicles
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- 2. drivers — PERSON IS CANONICAL (person_id NOT NULL, no contact columns)
-- =====================================================================
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null,
  driver_code text,
  operator_name text,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_person_fk
    foreign key (person_id, tenant_id) references public.people(id, tenant_id),
  constraint drivers_id_tenant_key unique (id, tenant_id),
  constraint drivers_tenant_person_key unique (tenant_id, person_id)
);
create index drivers_tenant_idx on public.drivers (tenant_id, is_active);

grant select on public.drivers to authenticated;
grant all on public.drivers to service_role;
alter table public.drivers enable row level security;
create policy "Elevated roles read drivers" on public.drivers
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- 3. transport_legs
-- =====================================================================
create table public.transport_legs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  journey_step_id uuid,
  sequence integer not null,
  title text not null,
  leg_kind public.transport_leg_kind not null default 'transfer',
  plan_origin public.step_plan_origin not null default 'planned',
  ad_hoc_reason text,
  replaces_leg_id uuid references public.transport_legs(id),
  origin_label text,
  destination_label text,
  planned_departure timestamptz,
  planned_arrival timestamptz,
  expected_departure timestamptz,
  expected_arrival timestamptz,
  return_time timestamptz,
  return_time_note text,
  vehicle_id uuid,
  driver_id uuid,
  capacity_override integer,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_legs_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint transport_legs_step_fk
    foreign key (journey_step_id, tenant_id) references public.journey_steps(id, tenant_id),
  constraint transport_legs_vehicle_fk
    foreign key (vehicle_id, tenant_id) references public.vehicles(id, tenant_id),
  constraint transport_legs_driver_fk
    foreign key (driver_id, tenant_id) references public.drivers(id, tenant_id),
  constraint transport_legs_id_tenant_key unique (id, tenant_id),
  constraint transport_legs_ad_hoc_has_no_baseline
    check (plan_origin = 'planned' or (planned_departure is null and planned_arrival is null)),
  constraint transport_legs_ad_hoc_reason
    check (plan_origin = 'planned' or nullif(btrim(coalesce(ad_hoc_reason,'')),'') is not null),
  constraint transport_legs_capacity_positive
    check (capacity_override is null or capacity_override > 0)
);
create unique index transport_legs_operation_sequence_key
  on public.transport_legs (operation_id, sequence);
create index transport_legs_operation_idx on public.transport_legs (operation_id, sequence);
create index transport_legs_step_idx on public.transport_legs (journey_step_id);
create index transport_legs_vehicle_idx on public.transport_legs (vehicle_id);
create index transport_legs_driver_idx on public.transport_legs (driver_id);

grant select on public.transport_legs to authenticated;
grant all on public.transport_legs to service_role;
alter table public.transport_legs enable row level security;
create policy "Elevated roles read transport legs" on public.transport_legs
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- 4. transport_leg_stops
-- =====================================================================
create table public.transport_leg_stops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  transport_leg_id uuid not null,
  sequence integer not null,
  label text not null,
  is_pickup boolean not null default false,
  planned_time timestamptz,
  expected_time timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_leg_stops_leg_fk
    foreign key (transport_leg_id, tenant_id) references public.transport_legs(id, tenant_id) on delete cascade,
  constraint transport_leg_stops_id_tenant_key unique (id, tenant_id)
);
create unique index transport_leg_stops_sequence_key
  on public.transport_leg_stops (transport_leg_id, sequence);

grant select on public.transport_leg_stops to authenticated;
grant all on public.transport_leg_stops to service_role;
alter table public.transport_leg_stops enable row level security;
create policy "Elevated roles read transport stops" on public.transport_leg_stops
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- 5. transport_events (append-only)
-- =====================================================================
create table public.transport_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  transport_leg_id uuid,
  transport_leg_stop_id uuid,
  event_type public.transport_event_type not null,
  actor_profile_id uuid references public.profiles(id),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  note text,
  context jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint transport_events_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint transport_events_leg_fk
    foreign key (transport_leg_id, tenant_id) references public.transport_legs(id, tenant_id),
  constraint transport_events_stop_fk
    foreign key (transport_leg_stop_id, tenant_id) references public.transport_leg_stops(id, tenant_id)
);
create unique index transport_events_milestone_once
  on public.transport_events (transport_leg_id, event_type)
  where event_type in ('LEG_CREATED','VEHICLE_REQUESTED','VEHICLE_EN_ROUTE_TO_PICKUP',
                       'VEHICLE_AT_PICKUP','LEG_DEPARTED','DESTINATION_ARRIVED','LEG_CANCELLED');
create unique index transport_events_stop_reached_once
  on public.transport_events (transport_leg_stop_id)
  where event_type = 'STOP_REACHED';
create index transport_events_operation_idx
  on public.transport_events (operation_id, occurred_at desc, recorded_at desc);
create index transport_events_leg_idx
  on public.transport_events (transport_leg_id, event_type, recorded_at desc);

grant select on public.transport_events to authenticated;
grant all on public.transport_events to service_role;
alter table public.transport_events enable row level security;
create policy "Elevated roles read transport events" on public.transport_events
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- 6. transport_seat_assignments — seat belongs to the leg; rows are never deleted
-- =====================================================================
create table public.transport_seat_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  transport_leg_id uuid not null,
  participation_id uuid not null,
  seat_label text,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  released_at timestamptz,
  released_by uuid references public.profiles(id),
  release_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seat_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint seat_leg_fk
    foreign key (transport_leg_id, tenant_id) references public.transport_legs(id, tenant_id),
  constraint seat_participation_fk
    foreign key (participation_id, tenant_id) references public.operation_participations(id, tenant_id),
  constraint seat_id_tenant_key unique (id, tenant_id)
);
create unique index seat_active_participation_key
  on public.transport_seat_assignments (transport_leg_id, participation_id)
  where released_at is null;
create unique index seat_active_label_key
  on public.transport_seat_assignments (transport_leg_id, lower(seat_label))
  where released_at is null and seat_label is not null;
create index seat_leg_idx on public.transport_seat_assignments (transport_leg_id, released_at);
create index seat_participation_idx on public.transport_seat_assignments (participation_id);

grant select on public.transport_seat_assignments to authenticated;
grant all on public.transport_seat_assignments to service_role;
alter table public.transport_seat_assignments enable row level security;
create policy "Elevated roles read seat assignments" on public.transport_seat_assignments
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- GUARDS — no direct DML, ever
-- =====================================================================
create or replace function app_private.w05_control_active()
returns boolean language sql stable set search_path = 'pg_catalog','public' as $$
  select coalesce(current_setting('app.w05_control', true), 'off') = 'on'
$$;

create or replace function public.guard_w05_mutation()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  if app_private.w05_control_active() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Mobility data can only change through the approved commands';
end;
$$;

create or replace function public.guard_w05_append_only()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create or replace function public.guard_transport_leg_baseline()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
declare _status public.operation_status;
begin
  if new.plan_origin is distinct from old.plan_origin then
    raise exception 'A transport leg cannot change between planned and ad-hoc';
  end if;
  if new.tenant_id is distinct from old.tenant_id
     or new.operation_id is distinct from old.operation_id then
    raise exception 'A transport leg cannot be moved between operations';
  end if;
  select o.status into _status from public.operations o where o.id = new.operation_id;
  if _status not in ('draft','planning') and new.plan_origin = 'planned'
     and (new.planned_departure is distinct from old.planned_departure
          or new.planned_arrival is distinct from old.planned_arrival
          or new.sequence is distinct from old.sequence) then
    raise exception 'The transport baseline is frozen from "ready" onward. Use the expected window instead.';
  end if;
  return new;
end;
$$;

create trigger vehicles_guard before insert or update or delete on public.vehicles
  for each row execute function public.guard_w05_mutation();
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

create trigger drivers_guard before insert or update or delete on public.drivers
  for each row execute function public.guard_w05_mutation();
create trigger drivers_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();

create trigger transport_legs_guard before insert or update or delete on public.transport_legs
  for each row execute function public.guard_w05_mutation();
create trigger transport_legs_baseline before update on public.transport_legs
  for each row execute function public.guard_transport_leg_baseline();
create trigger transport_legs_updated_at before update on public.transport_legs
  for each row execute function public.set_updated_at();

create trigger transport_leg_stops_guard before insert or update or delete on public.transport_leg_stops
  for each row execute function public.guard_w05_mutation();
create trigger transport_leg_stops_updated_at before update on public.transport_leg_stops
  for each row execute function public.set_updated_at();

create trigger transport_events_guard before insert on public.transport_events
  for each row execute function public.guard_w05_mutation();
create trigger transport_events_append_only before update or delete on public.transport_events
  for each row execute function public.guard_w05_append_only();

create trigger seat_guard before insert or update or delete on public.transport_seat_assignments
  for each row execute function public.guard_w05_mutation();
create trigger seat_updated_at before update on public.transport_seat_assignments
  for each row execute function public.set_updated_at();

-- =====================================================================
-- PRIVATE HELPERS
-- =====================================================================
create or replace function app_private.w05_assert_role(_tenant_id uuid)
returns void language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id,
       array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission for mobility in this organization';
  end if;
end;
$$;

create or replace function app_private.w05_leg(_leg_id uuid)
returns public.transport_legs language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs;
begin
  select * into _leg from public.transport_legs l where l.id = _leg_id;
  if _leg.id is null then raise exception 'Transport leg not found'; end if;
  perform app_private.w05_assert_role(_leg.tenant_id);
  return _leg;
end;
$$;

create or replace function app_private.w05_operation(_operation_id uuid)
returns public.operations language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _op public.operations;
begin
  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  perform app_private.w05_assert_role(_op.tenant_id);
  return _op;
end;
$$;

create or replace function app_private.w05_has_event(_leg_id uuid, _type public.transport_event_type)
returns boolean language sql stable security definer
set search_path = 'pg_catalog','public' as $$
  select exists (select 1 from public.transport_events e
                 where e.transport_leg_id = _leg_id and e.event_type = _type)
$$;

create or replace function app_private.w05_assert_open(_leg public.transport_legs)
returns void language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
begin
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    raise exception 'This transport leg already departed. Create a new ad-hoc leg instead of rewriting history.';
  end if;
end;
$$;

-- PRIVATE: the only writer of transport_events.
create or replace function app_private.record_transport_event(
  _leg public.transport_legs, _type public.transport_event_type,
  _occurred_at timestamptz default null, _note text default null,
  _context jsonb default '{}'::jsonb, _stop_id uuid default null)
returns uuid language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _id uuid; _at timestamptz := coalesce(_occurred_at, now());
begin
  if _at > now() + interval '5 minutes' then
    raise exception 'A transport fact cannot be recorded in the future';
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));

  perform set_config('app.w05_control','on', true);
  insert into public.transport_events
    (tenant_id, operation_id, transport_leg_id, transport_leg_stop_id, event_type,
     actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, _stop_id, _type, auth.uid(), _at,
          nullif(btrim(coalesce(_note,'')),''), coalesce(_context,'{}'::jsonb),
          gen_random_uuid()::text)
  on conflict do nothing
  returning id into _id;
  perform set_config('app.w05_control','off', true);

  if _id is null then
    select e.id into _id from public.transport_events e
      where e.transport_leg_id = _leg.id and e.event_type = _type
        and e.transport_leg_stop_id is not distinct from _stop_id
      limit 1;
  end if;
  return _id;
end;
$$;

create or replace function app_private.w05_seat_eligible(_participation_id uuid)
returns boolean language sql stable security definer
set search_path = 'pg_catalog','public' as $$
  select exists (
    select 1 from public.operation_participations p
    where p.id = _participation_id
      and p.participation_kind in ('participant','crew','support')
      and p.status <> 'cancelled')
$$;

create or replace function app_private.w05_claim_key(
  _tenant_id uuid, _action text, _key text, _result jsonb)
returns void language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
begin
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_tenant_id, auth.uid(), _action, _key, _result);
end;
$$;

create or replace function app_private.w05_replay(_action text, _key text)
returns jsonb language sql stable security definer
set search_path = 'pg_catalog','public' as $$
  select k.result from public.idempotency_keys k
   where k.actor_profile_id = auth.uid() and k.action = _action and k.idempotency_key = _key
$$;

-- =====================================================================
-- COMMANDS · VEHICLES (1-3)
-- =====================================================================
create or replace function public.create_vehicle(
  _tenant_id uuid, _label text, _idempotency_key text,
  _vehicle_kind public.transport_vehicle_kind default 'bus',
  _identifier text default null, _capacity integer default null,
  _operator_name text default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.vehicles; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
begin
  perform app_private.w05_assert_role(_tenant_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _existing := app_private.w05_replay('vehicle.create', _key);
  if _existing is not null then return _existing; end if;
  if nullif(btrim(coalesce(_label,'')),'') is null then raise exception 'A vehicle label is required'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w05_control','on', true);
  insert into public.vehicles (tenant_id, label, vehicle_kind, identifier, capacity,
                               operator_name, notes, created_by)
  values (_tenant_id, btrim(_label), _vehicle_kind,
          nullif(btrim(coalesce(_identifier,'')),''), _capacity,
          nullif(btrim(coalesce(_operator_name,'')),''),
          nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'vehicle.created',
    'vehicle', _row.id, _key, jsonb_build_object('kind', _row.vehicle_kind, 'capacity', _row.capacity));
  _existing := jsonb_build_object('vehicle_id', _row.id, 'tenant_id', _tenant_id);
  perform app_private.w05_claim_key(_tenant_id, 'vehicle.create', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.update_vehicle(
  _vehicle_id uuid, _label text default null,
  _vehicle_kind public.transport_vehicle_kind default null,
  _identifier text default null, _capacity integer default null,
  _operator_name text default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.vehicles;
begin
  select * into _row from public.vehicles v where v.id = _vehicle_id;
  if _row.id is null then raise exception 'Vehicle not found'; end if;
  perform app_private.w05_assert_role(_row.tenant_id);
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w05_control','on', true);
  update public.vehicles set
    label = coalesce(nullif(btrim(coalesce(_label,'')),''), label),
    vehicle_kind = coalesce(_vehicle_kind, vehicle_kind),
    identifier = coalesce(nullif(btrim(coalesce(_identifier,'')),''), identifier),
    capacity = coalesce(_capacity, capacity),
    operator_name = coalesce(nullif(btrim(coalesce(_operator_name,'')),''), operator_name),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes)
  where id = _vehicle_id returning * into _row;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'vehicle.updated',
    'vehicle', _row.id, null, jsonb_build_object('kind', _row.vehicle_kind));
  return jsonb_build_object('vehicle_id', _row.id);
end;
$$;

create or replace function public.set_vehicle_active(_vehicle_id uuid, _is_active boolean, _reason text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.vehicles; _why text := nullif(btrim(coalesce(_reason,'')),'');
begin
  select * into _row from public.vehicles v where v.id = _vehicle_id;
  if _row.id is null then raise exception 'Vehicle not found'; end if;
  perform app_private.w05_assert_role(_row.tenant_id);
  if _is_active is false and _why is null then
    raise exception 'A reason is required to retire a vehicle';
  end if;
  perform app_private.assert_generic_note(_why);
  perform set_config('app.w05_control','on', true);
  update public.vehicles set is_active = _is_active where id = _vehicle_id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_row.tenant_id, auth.uid(),
    case when _is_active then 'vehicle.reactivated' else 'vehicle.deactivated' end,
    'vehicle', _vehicle_id, null, jsonb_build_object('reason', _why));
  return jsonb_build_object('vehicle_id', _vehicle_id, 'is_active', _is_active);
end;
$$;

-- =====================================================================
-- COMMANDS · DRIVERS (4-6) — Person stays canonical
-- =====================================================================
create or replace function public.create_driver(
  _tenant_id uuid, _person_id uuid, _idempotency_key text,
  _driver_code text default null, _operator_name text default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.drivers; _person public.people; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
begin
  perform app_private.w05_assert_role(_tenant_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _existing := app_private.w05_replay('driver.create', _key);
  if _existing is not null then return _existing; end if;

  select * into _person from public.people p where p.id = _person_id and p.tenant_id = _tenant_id;
  if _person.id is null then raise exception 'Person not found in this organization'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w05_control','on', true);
  insert into public.drivers (tenant_id, person_id, driver_code, operator_name, notes, created_by)
  values (_tenant_id, _person_id, nullif(btrim(coalesce(_driver_code,'')),''),
          nullif(btrim(coalesce(_operator_name,'')),''),
          nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  on conflict (tenant_id, person_id) do nothing
  returning * into _row;
  perform set_config('app.w05_control','off', true);

  if _row.id is null then
    raise exception 'This person is already registered as a driver';
  end if;

  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'driver.created',
    'driver', _row.id, _key, jsonb_build_object('person_id', _person_id));
  _existing := jsonb_build_object('driver_id', _row.id, 'person_id', _person_id, 'tenant_id', _tenant_id);
  perform app_private.w05_claim_key(_tenant_id, 'driver.create', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.update_driver(
  _driver_id uuid, _driver_code text default null,
  _operator_name text default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.drivers;
begin
  select * into _row from public.drivers d where d.id = _driver_id;
  if _row.id is null then raise exception 'Driver not found'; end if;
  perform app_private.w05_assert_role(_row.tenant_id);
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));
  perform set_config('app.w05_control','on', true);
  update public.drivers set
    driver_code = coalesce(nullif(btrim(coalesce(_driver_code,'')),''), driver_code),
    operator_name = coalesce(nullif(btrim(coalesce(_operator_name,'')),''), operator_name),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes)
  where id = _driver_id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'driver.updated',
    'driver', _driver_id, null, '{}'::jsonb);
  return jsonb_build_object('driver_id', _driver_id);
end;
$$;

create or replace function public.set_driver_active(_driver_id uuid, _is_active boolean, _reason text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.drivers; _why text := nullif(btrim(coalesce(_reason,'')),'');
begin
  select * into _row from public.drivers d where d.id = _driver_id;
  if _row.id is null then raise exception 'Driver not found'; end if;
  perform app_private.w05_assert_role(_row.tenant_id);
  if _is_active is false and _why is null then
    raise exception 'A reason is required to retire a driver';
  end if;
  perform app_private.assert_generic_note(_why);
  perform set_config('app.w05_control','on', true);
  update public.drivers set is_active = _is_active where id = _driver_id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_row.tenant_id, auth.uid(),
    case when _is_active then 'driver.reactivated' else 'driver.deactivated' end,
    'driver', _driver_id, null, jsonb_build_object('reason', _why));
  return jsonb_build_object('driver_id', _driver_id, 'is_active', _is_active);
end;
$$;

-- =====================================================================
-- COMMANDS · LEGS (7-13)
-- =====================================================================
create or replace function public.create_transport_leg(
  _operation_id uuid, _title text, _idempotency_key text,
  _leg_kind public.transport_leg_kind default 'transfer',
  _origin_label text default null, _destination_label text default null,
  _planned_departure timestamptz default null, _planned_arrival timestamptz default null,
  _journey_step_id uuid default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _op public.operations; _row public.transport_legs; _seq int;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
begin
  _op := app_private.w05_operation(_operation_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _op.status not in ('draft','planning') then
    raise exception 'Planned transport legs can only be added while the operation is still being planned. Use an ad-hoc leg instead.';
  end if;
  _existing := app_private.w05_replay('transport.leg_create', _key);
  if _existing is not null then return _existing; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));
  if _journey_step_id is not null and not exists (
      select 1 from public.journey_steps s where s.id = _journey_step_id and s.operation_id = _op.id) then
    raise exception 'That journey step does not belong to this operation';
  end if;

  select coalesce(max(l.sequence),0) + 10 into _seq from public.transport_legs l where l.operation_id = _op.id;

  perform set_config('app.w05_control','on', true);
  insert into public.transport_legs (tenant_id, operation_id, journey_step_id, sequence, title,
    leg_kind, plan_origin, origin_label, destination_label, planned_departure, planned_arrival,
    notes, created_by)
  values (_op.tenant_id, _op.id, _journey_step_id, _seq, btrim(_title), _leg_kind, 'planned',
    nullif(btrim(coalesce(_origin_label,'')),''), nullif(btrim(coalesce(_destination_label,'')),''),
    _planned_departure, _planned_arrival, nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_transport_event(_row, 'LEG_CREATED', null, null,
    jsonb_build_object('plan_origin','planned','sequence',_seq));
  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'transport.leg_created',
    'transport_leg', _row.id, _key, jsonb_build_object('operation_id', _op.id, 'sequence', _seq));

  _existing := jsonb_build_object('transport_leg_id', _row.id, 'sequence', _seq, 'plan_origin','planned');
  perform app_private.w05_claim_key(_op.tenant_id, 'transport.leg_create', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.create_ad_hoc_transport_leg(
  _operation_id uuid, _title text, _reason text, _idempotency_key text,
  _leg_kind public.transport_leg_kind default 'transfer',
  _origin_label text default null, _destination_label text default null,
  _expected_departure timestamptz default null, _expected_arrival timestamptz default null,
  _journey_step_id uuid default null, _replaces_leg_id uuid default null,
  _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _op public.operations; _row public.transport_legs; _seq int;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _existing jsonb;
begin
  _op := app_private.w05_operation(_operation_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _why is null then raise exception 'A reason is required to add a transport leg during the operation'; end if;
  if _op.status in ('completed','cancelled') then
    raise exception 'A % operation no longer accepts new transport legs', _op.status;
  end if;
  _existing := app_private.w05_replay('transport.leg_create_ad_hoc', _key);
  if _existing is not null then return _existing; end if;
  perform app_private.assert_generic_note(_why);
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));
  if _journey_step_id is not null and not exists (
      select 1 from public.journey_steps s where s.id = _journey_step_id and s.operation_id = _op.id) then
    raise exception 'That journey step does not belong to this operation';
  end if;
  if _replaces_leg_id is not null and not exists (
      select 1 from public.transport_legs l where l.id = _replaces_leg_id and l.operation_id = _op.id) then
    raise exception 'The replaced transport leg does not belong to this operation';
  end if;

  select coalesce(max(l.sequence),0) + 10 into _seq from public.transport_legs l where l.operation_id = _op.id;

  perform set_config('app.w05_control','on', true);
  insert into public.transport_legs (tenant_id, operation_id, journey_step_id, sequence, title,
    leg_kind, plan_origin, ad_hoc_reason, replaces_leg_id, origin_label, destination_label,
    expected_departure, expected_arrival, notes, created_by)
  values (_op.tenant_id, _op.id, _journey_step_id, _seq, btrim(_title), _leg_kind, 'ad_hoc', _why,
    _replaces_leg_id, nullif(btrim(coalesce(_origin_label,'')),''),
    nullif(btrim(coalesce(_destination_label,'')),''), _expected_departure, _expected_arrival,
    nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_transport_event(_row, 'LEG_CREATED', null, _why,
    jsonb_build_object('plan_origin','ad_hoc','replaces_leg_id',_replaces_leg_id,'sequence',_seq));
  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'transport.leg_created_ad_hoc',
    'transport_leg', _row.id, _key,
    jsonb_build_object('operation_id', _op.id, 'reason', _why, 'replaces_leg_id', _replaces_leg_id));

  _existing := jsonb_build_object('transport_leg_id', _row.id, 'sequence', _seq, 'plan_origin','ad_hoc');
  perform app_private.w05_claim_key(_op.tenant_id, 'transport.leg_create_ad_hoc', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.update_transport_leg(
  _transport_leg_id uuid, _title text default null,
  _leg_kind public.transport_leg_kind default null,
  _origin_label text default null, _destination_label text default null,
  _capacity_override integer default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));
  perform set_config('app.w05_control','on', true);
  update public.transport_legs set
    title = coalesce(nullif(btrim(coalesce(_title,'')),''), title),
    leg_kind = coalesce(_leg_kind, leg_kind),
    origin_label = coalesce(nullif(btrim(coalesce(_origin_label,'')),''), origin_label),
    destination_label = coalesce(nullif(btrim(coalesce(_destination_label,'')),''), destination_label),
    capacity_override = coalesce(_capacity_override, capacity_override),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes)
  where id = _leg.id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.leg_updated',
    'transport_leg', _leg.id, null, '{}'::jsonb);
  return jsonb_build_object('transport_leg_id', _leg.id);
end;
$$;

create or replace function public.set_transport_leg_planned_window(
  _transport_leg_id uuid, _planned_departure timestamptz, _planned_arrival timestamptz)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _op public.operations;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  select * into _op from public.operations o where o.id = _leg.operation_id;
  if _leg.plan_origin <> 'planned' then
    raise exception 'An ad-hoc transport leg has no planned baseline';
  end if;
  if _op.status not in ('draft','planning') then
    raise exception 'The transport baseline is frozen from "ready" onward. Use the expected window instead.';
  end if;
  if _planned_departure is not null and _planned_arrival is not null
     and _planned_arrival < _planned_departure then
    raise exception 'Arrival cannot be earlier than departure';
  end if;
  perform set_config('app.w05_control','on', true);
  update public.transport_legs
    set planned_departure = _planned_departure, planned_arrival = _planned_arrival
    where id = _leg.id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.leg_planned_window_set',
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_departure', _leg.planned_departure, 'previous_arrival', _leg.planned_arrival,
                       'new_departure', _planned_departure, 'new_arrival', _planned_arrival));
  return jsonb_build_object('transport_leg_id', _leg.id);
end;
$$;

create or replace function public.set_transport_leg_expected_window(
  _transport_leg_id uuid, _reason text,
  _expected_departure timestamptz default null, _expected_arrival timestamptz default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _op public.operations;
  _why text := nullif(btrim(coalesce(_reason,'')),''); _id uuid;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  select * into _op from public.operations o where o.id = _leg.operation_id;
  if _why is null then raise exception 'A reason is required to change the transport forecast'; end if;
  perform app_private.assert_generic_note(_why);
  if _op.status not in ('planning','ready','active') then
    raise exception 'The transport forecast can only change while the operation is being planned, ready or running';
  end if;
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED')
     or app_private.w05_has_event(_leg.id, 'DESTINATION_ARRIVED') then
    raise exception 'This transport leg is already closed';
  end if;
  if _expected_departure is null and _expected_arrival is null then
    raise exception 'Provide at least one expected time';
  end if;
  if _expected_departure is not null and _expected_arrival is not null
     and _expected_arrival < _expected_departure then
    raise exception 'Arrival cannot be earlier than departure';
  end if;

  perform set_config('app.w05_control','on', true);
  update public.transport_legs set
    expected_departure = coalesce(_expected_departure, expected_departure),
    expected_arrival = coalesce(_expected_arrival, expected_arrival)
  where id = _leg.id;
  perform set_config('app.w05_control','off', true);

  perform set_config('app.w05_control','on', true);
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, 'EXPECTED_TIME_CHANGED', auth.uid(), now(), _why,
    jsonb_build_object('previous_departure', _leg.expected_departure, 'previous_arrival', _leg.expected_arrival,
                       'new_departure', coalesce(_expected_departure, _leg.expected_departure),
                       'new_arrival', coalesce(_expected_arrival, _leg.expected_arrival),
                       'planned_departure', _leg.planned_departure, 'planned_arrival', _leg.planned_arrival),
    gen_random_uuid()::text)
  returning id into _id;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.leg_expected_window_set',
    'transport_leg', _leg.id, null, jsonb_build_object('reason', _why, 'transport_event_id', _id));
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$$;

create or replace function public.cancel_transport_leg(_transport_leg_id uuid, _reason text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _why text := nullif(btrim(coalesce(_reason,'')),''); _id uuid;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  if _why is null then raise exception 'A reason is required to cancel a transport leg'; end if;
  perform app_private.assert_generic_note(_why);
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;
  if app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    raise exception 'A departed transport leg cannot be cancelled. Record what happened instead.';
  end if;
  _id := app_private.record_transport_event(_leg, 'LEG_CANCELLED', null, _why);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.leg_cancelled',
    'transport_leg', _leg.id, null, jsonb_build_object('reason', _why));
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$$;

create or replace function public.link_transport_leg_to_journey_step(
  _transport_leg_id uuid, _journey_step_id uuid)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  if _journey_step_id is not null and not exists (
      select 1 from public.journey_steps s
       where s.id = _journey_step_id and s.operation_id = _leg.operation_id) then
    raise exception 'That journey step does not belong to this operation';
  end if;
  perform set_config('app.w05_control','on', true);
  update public.transport_legs set journey_step_id = _journey_step_id where id = _leg.id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.leg_linked_to_step',
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_step_id', _leg.journey_step_id, 'journey_step_id', _journey_step_id));
  return jsonb_build_object('transport_leg_id', _leg.id, 'journey_step_id', _journey_step_id);
end;
$$;

-- =====================================================================
-- COMMANDS · STOPS (14-16)
-- =====================================================================
create or replace function public.add_transport_leg_stop(
  _transport_leg_id uuid, _label text,
  _is_pickup boolean default false, _planned_time timestamptz default null,
  _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _row public.transport_leg_stops; _seq int;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  if nullif(btrim(coalesce(_label,'')),'') is null then raise exception 'A stop label is required'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));
  select coalesce(max(s.sequence),0) + 10 into _seq
    from public.transport_leg_stops s where s.transport_leg_id = _leg.id;
  perform set_config('app.w05_control','on', true);
  insert into public.transport_leg_stops (tenant_id, transport_leg_id, sequence, label,
    is_pickup, planned_time, notes, created_by)
  values (_leg.tenant_id, _leg.id, _seq, btrim(_label), coalesce(_is_pickup,false),
          _planned_time, nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.stop_added',
    'transport_leg_stop', _row.id, null,
    jsonb_build_object('transport_leg_id', _leg.id, 'sequence', _seq));
  return jsonb_build_object('transport_leg_stop_id', _row.id, 'sequence', _seq);
end;
$$;

create or replace function public.update_transport_leg_stop(
  _transport_leg_stop_id uuid, _label text default null,
  _is_pickup boolean default null, _planned_time timestamptz default null,
  _expected_time timestamptz default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stop public.transport_leg_stops; _leg public.transport_legs;
begin
  select * into _stop from public.transport_leg_stops s where s.id = _transport_leg_stop_id;
  if _stop.id is null then raise exception 'Transport stop not found'; end if;
  _leg := app_private.w05_leg(_stop.transport_leg_id);
  if exists (select 1 from public.transport_events e
              where e.transport_leg_stop_id = _stop.id and e.event_type = 'STOP_REACHED') then
    raise exception 'A stop that was already reached cannot be rewritten';
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));
  perform set_config('app.w05_control','on', true);
  update public.transport_leg_stops set
    label = coalesce(nullif(btrim(coalesce(_label,'')),''), label),
    is_pickup = coalesce(_is_pickup, is_pickup),
    planned_time = coalesce(_planned_time, planned_time),
    expected_time = coalesce(_expected_time, expected_time),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes)
  where id = _stop.id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.stop_updated',
    'transport_leg_stop', _stop.id, null, jsonb_build_object('transport_leg_id', _leg.id));
  return jsonb_build_object('transport_leg_stop_id', _stop.id);
end;
$$;

create or replace function public.remove_transport_leg_stop(_transport_leg_stop_id uuid, _reason text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stop public.transport_leg_stops; _leg public.transport_legs;
  _why text := nullif(btrim(coalesce(_reason,'')),'');
begin
  select * into _stop from public.transport_leg_stops s where s.id = _transport_leg_stop_id;
  if _stop.id is null then raise exception 'Transport stop not found'; end if;
  _leg := app_private.w05_leg(_stop.transport_leg_id);
  if _why is null then raise exception 'A reason is required to remove a stop'; end if;
  perform app_private.assert_generic_note(_why);
  if exists (select 1 from public.transport_events e
              where e.transport_leg_stop_id = _stop.id and e.event_type = 'STOP_REACHED') then
    raise exception 'A stop that was already reached cannot be removed';
  end if;
  -- Evidence first, then removal: the audit row keeps the stop's meaning.
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.stop_removed',
    'transport_leg_stop', _stop.id, null,
    jsonb_build_object('transport_leg_id', _leg.id, 'label', _stop.label,
                       'sequence', _stop.sequence, 'reason', _why));
  perform set_config('app.w05_control','on', true);
  delete from public.transport_leg_stops where id = _stop.id;
  perform set_config('app.w05_control','off', true);
  return jsonb_build_object('transport_leg_stop_id', _stop.id, 'removed', true);
end;
$$;

-- =====================================================================
-- COMMANDS · ASSIGNMENT (17-19)
-- =====================================================================
create or replace function public.assign_vehicle_to_leg(
  _transport_leg_id uuid, _vehicle_id uuid, _reason text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _vehicle public.vehicles;
  _why text := nullif(btrim(coalesce(_reason,'')),''); _id uuid; _changed boolean;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  select * into _vehicle from public.vehicles v where v.id = _vehicle_id and v.tenant_id = _leg.tenant_id;
  if _vehicle.id is null then raise exception 'Vehicle not found in this organization'; end if;
  if not _vehicle.is_active then raise exception 'That vehicle is retired'; end if;
  if _leg.vehicle_id = _vehicle_id then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;
  _changed := _leg.vehicle_id is not null;
  if _changed and _why is null then
    raise exception 'A reason is required to replace the assigned vehicle';
  end if;
  perform app_private.assert_generic_note(_why);

  perform set_config('app.w05_control','on', true);
  update public.transport_legs set vehicle_id = _vehicle_id where id = _leg.id;
  perform set_config('app.w05_control','off', true);

  if _changed then
    perform set_config('app.w05_control','on', true);
    insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
      actor_profile_id, occurred_at, note, context, correlation_id)
    values (_leg.tenant_id, _leg.operation_id, _leg.id, 'ASSIGNMENT_CHANGED', auth.uid(), now(), _why,
      jsonb_build_object('field','vehicle','previous_vehicle_id',_leg.vehicle_id,'new_vehicle_id',_vehicle_id),
      gen_random_uuid()::text)
    returning id into _id;
    perform set_config('app.w05_control','off', true);
  else
    perform set_config('app.w05_control','on', true);
    insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
      actor_profile_id, occurred_at, note, context, correlation_id)
    values (_leg.tenant_id, _leg.operation_id, _leg.id, 'VEHICLE_ASSIGNED', auth.uid(), now(), null,
      jsonb_build_object('vehicle_id', _vehicle_id), gen_random_uuid()::text)
    returning id into _id;
    perform set_config('app.w05_control','off', true);
  end if;

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(),
    case when _changed then 'transport.vehicle_changed' else 'transport.vehicle_assigned' end,
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_vehicle_id', _leg.vehicle_id, 'vehicle_id', _vehicle_id, 'reason', _why));
  return jsonb_build_object('transport_leg_id', _leg.id, 'vehicle_id', _vehicle_id, 'transport_event_id', _id);
end;
$$;

create or replace function public.assign_driver_to_leg(
  _transport_leg_id uuid, _driver_id uuid, _reason text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _driver public.drivers;
  _why text := nullif(btrim(coalesce(_reason,'')),''); _id uuid; _changed boolean;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  select * into _driver from public.drivers d where d.id = _driver_id and d.tenant_id = _leg.tenant_id;
  if _driver.id is null then raise exception 'Driver not found in this organization'; end if;
  if not _driver.is_active then raise exception 'That driver is retired'; end if;
  if _leg.driver_id = _driver_id then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;
  _changed := _leg.driver_id is not null;
  if _changed and _why is null then
    raise exception 'A reason is required to replace the assigned driver';
  end if;
  perform app_private.assert_generic_note(_why);

  perform set_config('app.w05_control','on', true);
  update public.transport_legs set driver_id = _driver_id where id = _leg.id;
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id,
    case when _changed then 'ASSIGNMENT_CHANGED' else 'DRIVER_ASSIGNED' end,
    auth.uid(), now(), _why,
    jsonb_build_object('field','driver','previous_driver_id',_leg.driver_id,'new_driver_id',_driver_id),
    gen_random_uuid()::text)
  returning id into _id;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(),
    case when _changed then 'transport.driver_changed' else 'transport.driver_assigned' end,
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_driver_id', _leg.driver_id, 'driver_id', _driver_id, 'reason', _why));
  return jsonb_build_object('transport_leg_id', _leg.id, 'driver_id', _driver_id, 'transport_event_id', _id);
end;
$$;

create or replace function public.clear_leg_assignment(_transport_leg_id uuid, _reason text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _why text := nullif(btrim(coalesce(_reason,'')),''); _id uuid;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  if _why is null then raise exception 'A reason is required to clear the assignment'; end if;
  perform app_private.assert_generic_note(_why);
  if _leg.vehicle_id is null and _leg.driver_id is null then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;

  perform set_config('app.w05_control','on', true);
  update public.transport_legs set vehicle_id = null, driver_id = null where id = _leg.id;
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, 'ASSIGNMENT_CLEARED', auth.uid(), now(), _why,
    jsonb_build_object('previous_vehicle_id', _leg.vehicle_id, 'previous_driver_id', _leg.driver_id),
    gen_random_uuid()::text)
  returning id into _id;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.assignment_cleared',
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_vehicle_id', _leg.vehicle_id, 'previous_driver_id', _leg.driver_id,
                       'reason', _why));
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$$;

-- =====================================================================
-- COMMANDS · DISPATCH FACTS (20-26)
-- =====================================================================
create or replace function public.request_vehicle(
  _transport_leg_id uuid, _occurred_at timestamptz default null, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _id uuid;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  _id := app_private.record_transport_event(_leg, 'VEHICLE_REQUESTED', _occurred_at, _note);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.vehicle_requested',
    'transport_leg', _leg.id, null, '{}'::jsonb);
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$$;

create or replace function public.record_vehicle_en_route_to_pickup(
  _transport_leg_id uuid, _occurred_at timestamptz default null, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _id uuid;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  if _leg.vehicle_id is null then
    raise exception 'Assign a vehicle before recording that it is on the way';
  end if;
  _id := app_private.record_transport_event(_leg, 'VEHICLE_EN_ROUTE_TO_PICKUP', _occurred_at, _note);
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$$;

create or replace function public.record_vehicle_at_pickup(
  _transport_leg_id uuid, _occurred_at timestamptz default null, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _id uuid;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  if _leg.vehicle_id is null then
    raise exception 'Assign a vehicle before recording that it arrived at the pickup point';
  end if;
  _id := app_private.record_transport_event(_leg, 'VEHICLE_AT_PICKUP', _occurred_at, _note);
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$$;

create or replace function public.record_leg_departed(
  _transport_leg_id uuid, _occurred_at timestamptz default null, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _id uuid;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;
  if _leg.vehicle_id is null or _leg.driver_id is null then
    raise exception 'A transport leg needs both a vehicle and a driver before it departs';
  end if;
  if not app_private.w05_has_event(_leg.id, 'VEHICLE_AT_PICKUP') then
    raise exception 'Record the vehicle at the pickup point before departure';
  end if;
  -- MOBILITY != JOURNEY: this is not W04 DEPARTURE_AUTHORIZED and never writes it.
  _id := app_private.record_transport_event(_leg, 'LEG_DEPARTED', _occurred_at, _note,
    jsonb_build_object('vehicle_id', _leg.vehicle_id, 'driver_id', _leg.driver_id));
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.leg_departed',
    'transport_leg', _leg.id, null,
    jsonb_build_object('vehicle_id', _leg.vehicle_id, 'driver_id', _leg.driver_id));
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$$;

create or replace function public.record_stop_reached(
  _transport_leg_stop_id uuid, _occurred_at timestamptz default null, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stop public.transport_leg_stops; _leg public.transport_legs; _id uuid;
begin
  select * into _stop from public.transport_leg_stops s where s.id = _transport_leg_stop_id;
  if _stop.id is null then raise exception 'Transport stop not found'; end if;
  _leg := app_private.w05_leg(_stop.transport_leg_id);
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if not app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    raise exception 'The vehicle has not departed yet';
  end if;
  if app_private.w05_has_event(_leg.id, 'DESTINATION_ARRIVED') then
    raise exception 'This transport leg already reached its destination';
  end if;
  _id := app_private.record_transport_event(_leg, 'STOP_REACHED', _occurred_at, _note,
    jsonb_build_object('label', _stop.label, 'sequence', _stop.sequence), _stop.id);
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_leg_stop_id', _stop.id,
                            'transport_event_id', _id);
end;
$$;

create or replace function public.record_destination_arrived(
  _transport_leg_id uuid, _occurred_at timestamptz default null, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _id uuid;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if not app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    raise exception 'The vehicle has not departed yet';
  end if;
  if app_private.w05_has_event(_leg.id, 'DESTINATION_ARRIVED') then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;
  -- MOBILITY != JOURNEY: this never writes the W04 group ARRIVED fact.
  _id := app_private.record_transport_event(_leg, 'DESTINATION_ARRIVED', _occurred_at, _note);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.destination_arrived',
    'transport_leg', _leg.id, null, '{}'::jsonb);
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$$;

create or replace function public.set_return_time(
  _transport_leg_id uuid, _return_time timestamptz, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _id uuid; _clean text := nullif(btrim(coalesce(_note,'')),'');
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if _return_time is null then raise exception 'A return time is required'; end if;
  perform app_private.assert_generic_note(_clean);

  -- RETURN TIME IS A RENDEZVOUS INSTRUCTION: it never touches planned/expected windows.
  perform set_config('app.w05_control','on', true);
  update public.transport_legs set return_time = _return_time, return_time_note = _clean
    where id = _leg.id;
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, 'RETURN_TIME_SET', auth.uid(), now(), _clean,
    jsonb_build_object('previous_return_time', _leg.return_time, 'return_time', _return_time),
    gen_random_uuid()::text)
  returning id into _id;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.return_time_set',
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_return_time', _leg.return_time, 'return_time', _return_time));
  return jsonb_build_object('transport_leg_id', _leg.id, 'return_time', _return_time,
                            'transport_event_id', _id);
end;
$$;

-- =====================================================================
-- COMMANDS · SEATS (27-28) + INCIDENT (29)
-- =====================================================================
create or replace function public.assign_seat(
  _transport_leg_id uuid, _participation_id uuid, _idempotency_key text,
  _seat_label text default null, _reason text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _row public.transport_seat_assignments;
  _previous public.transport_seat_assignments;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _existing jsonb;
  _label text := nullif(btrim(coalesce(_seat_label,'')),'');
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _existing := app_private.w05_replay('transport.seat_assign', _key);
  if _existing is not null then return _existing; end if;
  perform app_private.w05_assert_open(_leg);
  perform app_private.assert_generic_note(_why);

  if not exists (select 1 from public.operation_participations p
                 where p.id = _participation_id and p.operation_id = _leg.operation_id) then
    raise exception 'That person is not on this operation roster';
  end if;
  -- SEAT ELIGIBILITY: participant, crew and support only.
  if not app_private.w05_seat_eligible(_participation_id) then
    raise exception 'Only participants, crew and support can be seated, and cancelled people cannot';
  end if;

  select * into _previous from public.transport_seat_assignments a
    where a.transport_leg_id = _leg.id and a.participation_id = _participation_id
      and a.released_at is null;

  perform set_config('app.w05_control','on', true);
  if _previous.id is not null then
    -- HISTORY IS NEVER DESTROYED: the old row is released, never overwritten.
    update public.transport_seat_assignments
      set released_at = now(), released_by = auth.uid(),
          release_reason = coalesce(_why, 'Seat reassigned')
      where id = _previous.id;
    insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
      actor_profile_id, occurred_at, note, context, correlation_id)
    values (_leg.tenant_id, _leg.operation_id, _leg.id, 'SEAT_RELEASED', auth.uid(), now(), _why,
      jsonb_build_object('participation_id', _participation_id, 'seat_label', _previous.seat_label,
                         'seat_assignment_id', _previous.id, 'cause', 'reassignment'),
      gen_random_uuid()::text);
  end if;

  insert into public.transport_seat_assignments
    (tenant_id, operation_id, transport_leg_id, participation_id, seat_label, assigned_by)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, _participation_id, _label, auth.uid())
  returning * into _row;

  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, 'SEAT_ASSIGNED', auth.uid(), now(), _why,
    jsonb_build_object('participation_id', _participation_id, 'seat_label', _label,
                       'seat_assignment_id', _row.id,
                       'previous_seat_assignment_id', _previous.id),
    gen_random_uuid()::text);
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.seat_assigned',
    'transport_seat_assignment', _row.id, _key,
    jsonb_build_object('transport_leg_id', _leg.id, 'participation_id', _participation_id,
                       'seat_label', _label, 'replaced_assignment_id', _previous.id));

  _existing := jsonb_build_object('seat_assignment_id', _row.id, 'transport_leg_id', _leg.id,
                                  'participation_id', _participation_id, 'seat_label', _label);
  perform app_private.w05_claim_key(_leg.tenant_id, 'transport.seat_assign', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.release_seat(_seat_assignment_id uuid, _reason text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.transport_seat_assignments; _leg public.transport_legs;
  _why text := nullif(btrim(coalesce(_reason,'')),'');
begin
  select * into _row from public.transport_seat_assignments a where a.id = _seat_assignment_id;
  if _row.id is null then raise exception 'Seat assignment not found'; end if;
  _leg := app_private.w05_leg(_row.transport_leg_id);
  if _why is null then raise exception 'A reason is required to release a seat'; end if;
  perform app_private.assert_generic_note(_why);
  if _row.released_at is not null then
    return jsonb_build_object('seat_assignment_id', _row.id, 'unchanged', true);
  end if;
  if app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    raise exception 'Seats cannot be released after the leg departed. Create a new ad-hoc leg instead.';
  end if;

  perform set_config('app.w05_control','on', true);
  update public.transport_seat_assignments
    set released_at = now(), released_by = auth.uid(), release_reason = _why
    where id = _row.id;
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, 'SEAT_RELEASED', auth.uid(), now(), _why,
    jsonb_build_object('participation_id', _row.participation_id, 'seat_label', _row.seat_label,
                       'seat_assignment_id', _row.id, 'cause', 'manual_release'),
    gen_random_uuid()::text);
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.seat_released',
    'transport_seat_assignment', _row.id, null,
    jsonb_build_object('transport_leg_id', _leg.id, 'participation_id', _row.participation_id,
                       'seat_label', _row.seat_label, 'reason', _why));
  return jsonb_build_object('seat_assignment_id', _row.id, 'released', true);
end;
$$;

create or replace function public.note_transport_incident(
  _transport_leg_id uuid, _note text, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _clean text := nullif(btrim(coalesce(_note,'')),''); _id uuid;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  if _clean is null then raise exception 'An incident note is required'; end if;
  if length(_clean) > 500 then raise exception 'Keep the incident note short and factual'; end if;
  perform app_private.assert_generic_note(_clean);
  _id := app_private.record_transport_event(_leg, 'TRANSPORT_INCIDENT_NOTED', _occurred_at, _clean);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.incident_noted',
    'transport_leg', _leg.id, null, '{}'::jsonb);
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$$;

-- =====================================================================
-- READ FUNCTIONS (4) — ACTUAL is always derived, never stored
-- =====================================================================
create or replace function public.w05_leg_dispatch_state(_transport_leg_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _state public.transport_dispatch_state;
  _departed timestamptz; _arrived timestamptz; _requested timestamptz;
  _en_route timestamptz; _at_pickup timestamptz; _cancelled timestamptz;
  _seats int; _capacity int;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  select min(e.occurred_at) filter (where e.event_type = 'VEHICLE_REQUESTED'),
         min(e.occurred_at) filter (where e.event_type = 'VEHICLE_EN_ROUTE_TO_PICKUP'),
         min(e.occurred_at) filter (where e.event_type = 'VEHICLE_AT_PICKUP'),
         min(e.occurred_at) filter (where e.event_type = 'LEG_DEPARTED'),
         min(e.occurred_at) filter (where e.event_type = 'DESTINATION_ARRIVED'),
         min(e.occurred_at) filter (where e.event_type = 'LEG_CANCELLED')
    into _requested, _en_route, _at_pickup, _departed, _arrived, _cancelled
    from public.transport_events e where e.transport_leg_id = _leg.id;

  _state := case
    when _cancelled is not null then 'cancelled'
    when _arrived is not null then 'arrived'
    when _departed is not null then 'in_transit'
    when _at_pickup is not null then 'at_pickup'
    when _en_route is not null then 'en_route_to_pickup'
    when _leg.vehicle_id is not null or _leg.driver_id is not null then 'assigned'
    when _requested is not null then 'requested'
    else 'planned' end::public.transport_dispatch_state;

  select count(*) into _seats from public.transport_seat_assignments a
    where a.transport_leg_id = _leg.id and a.released_at is null;
  select coalesce(_leg.capacity_override, v.capacity) into _capacity
    from public.vehicles v where v.id = _leg.vehicle_id;

  return jsonb_build_object(
    'transport_leg_id', _leg.id,
    'dispatch_state', _state,
    'planned_departure', _leg.planned_departure,
    'planned_arrival', _leg.planned_arrival,
    'expected_departure', _leg.expected_departure,
    'expected_arrival', _leg.expected_arrival,
    'actual_departure', _departed,
    'actual_arrival', _arrived,
    'return_time', _leg.return_time,
    'departure_delay_minutes',
      case when _departed is not null
        then round(extract(epoch from (_departed - coalesce(_leg.expected_departure, _leg.planned_departure)))/60)
        else null end,
    'arrival_delay_minutes',
      case when _arrived is not null
        then round(extract(epoch from (_arrived - coalesce(_leg.expected_arrival, _leg.planned_arrival)))/60)
        else null end,
    'vehicle_id', _leg.vehicle_id,
    'driver_id', _leg.driver_id,
    'seats_taken', _seats,
    'capacity', coalesce(_leg.capacity_override, _capacity),
    'requested_at', _requested,
    'en_route_at', _en_route,
    'at_pickup_at', _at_pickup,
    'cancelled_at', _cancelled
  );
end;
$$;

create or replace function public.w05_leg_manifest(_transport_leg_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _seated jsonb; _released jsonb; _stops jsonb;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  select coalesce(jsonb_agg(jsonb_build_object(
           'seat_assignment_id', a.id, 'participation_id', a.participation_id,
           'person_id', pe.id, 'full_name', pe.full_name,
           'participation_kind', p.participation_kind, 'participation_status', p.status,
           'seat_label', a.seat_label, 'assigned_at', a.assigned_at,
           'still_eligible', app_private.w05_seat_eligible(a.participation_id))
           order by a.seat_label nulls last, pe.full_name), '[]'::jsonb)
    into _seated
    from public.transport_seat_assignments a
    join public.operation_participations p on p.id = a.participation_id
    join public.people pe on pe.id = p.person_id
    where a.transport_leg_id = _leg.id and a.released_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'seat_assignment_id', a.id, 'participation_id', a.participation_id,
           'full_name', pe.full_name, 'seat_label', a.seat_label,
           'assigned_at', a.assigned_at, 'released_at', a.released_at,
           'release_reason', a.release_reason) order by a.released_at desc), '[]'::jsonb)
    into _released
    from public.transport_seat_assignments a
    join public.operation_participations p on p.id = a.participation_id
    join public.people pe on pe.id = p.person_id
    where a.transport_leg_id = _leg.id and a.released_at is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'transport_leg_stop_id', s.id, 'sequence', s.sequence, 'label', s.label,
           'is_pickup', s.is_pickup, 'planned_time', s.planned_time,
           'expected_time', s.expected_time,
           'reached_at', (select min(e.occurred_at) from public.transport_events e
                          where e.transport_leg_stop_id = s.id and e.event_type = 'STOP_REACHED'))
           order by s.sequence), '[]'::jsonb)
    into _stops
    from public.transport_leg_stops s where s.transport_leg_id = _leg.id;

  return jsonb_build_object('transport_leg_id', _leg.id, 'seated', _seated,
                            'released_history', _released, 'stops', _stops);
end;
$$;

create or replace function public.w05_leg_seat_candidates(_transport_leg_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _rows jsonb;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  select coalesce(jsonb_agg(jsonb_build_object(
           'participation_id', p.id, 'person_id', pe.id, 'full_name', pe.full_name,
           'participation_kind', p.participation_kind, 'status', p.status)
           order by pe.full_name), '[]'::jsonb)
    into _rows
    from public.operation_participations p
    join public.people pe on pe.id = p.person_id
    where p.operation_id = _leg.operation_id
      and p.participation_kind in ('participant','crew','support')
      and p.status <> 'cancelled'
      and not exists (select 1 from public.transport_seat_assignments a
                      where a.transport_leg_id = _leg.id and a.participation_id = p.id
                        and a.released_at is null);
  return jsonb_build_object('transport_leg_id', _leg.id, 'candidates', _rows);
end;
$$;

create or replace function public.w05_operation_mobility(_operation_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _op public.operations; _legs jsonb;
begin
  _op := app_private.w05_operation(_operation_id);
  select coalesce(jsonb_agg(jsonb_build_object(
           'transport_leg_id', l.id, 'sequence', l.sequence, 'title', l.title,
           'leg_kind', l.leg_kind, 'plan_origin', l.plan_origin,
           'journey_step_id', l.journey_step_id,
           'origin_label', l.origin_label, 'destination_label', l.destination_label,
           'vehicle_label', v.label, 'driver_name', pe.full_name,
           'state', public.w05_leg_dispatch_state(l.id))
           order by l.sequence), '[]'::jsonb)
    into _legs
    from public.transport_legs l
    left join public.vehicles v on v.id = l.vehicle_id
    left join public.drivers d on d.id = l.driver_id
    left join public.people pe on pe.id = d.person_id
    where l.operation_id = _op.id;
  return jsonb_build_object('operation_id', _op.id, 'legs', _legs);
end;
$$;

-- =====================================================================
-- REALTIME — exactly two tables
-- =====================================================================
alter table public.transport_events replica identity full;
alter table public.transport_legs replica identity full;
alter publication supabase_realtime add table public.transport_events;
alter publication supabase_realtime add table public.transport_legs;