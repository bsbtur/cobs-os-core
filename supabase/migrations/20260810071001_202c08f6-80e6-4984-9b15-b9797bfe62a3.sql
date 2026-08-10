-- =====================================================================
-- COBS OS · W06 — HOSPITALITY CORE
-- Properties · Stays · Rooms · Rooming · Check-in · Check-out
-- Additive only. W01-W05 semantics untouched.
-- =====================================================================

create type public.hospitality_property_kind as enum
  ('hotel','hostel','resort','guesthouse','apartment','campus','venue','other');
create type public.hospitality_stay_status as enum
  ('draft','confirmed','active','completed','cancelled');
create type public.hospitality_room_status as enum ('available','blocked');
create type public.hospitality_event_type as enum (
  'STAY_CONFIRMED','STAY_CANCELLED','STAY_COMPLETED','STAY_FORECAST_UPDATED',
  'STAY_CHECKIN_OPENED','STAY_CHECKOUT_COMPLETED',
  'ROOM_ASSIGNED','ROOM_RELEASED','ROOM_BLOCKED','ROOM_UNBLOCKED',
  'GUEST_CHECKED_IN','GUEST_CHECKED_OUT','GUEST_NO_SHOW_RECORDED',
  'HOSPITALITY_ISSUE_NOTED');

-- =====================================================================
-- 1 · PROPERTIES — reusable tenant-owned lodging resource
-- =====================================================================
create table public.hospitality_properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  property_kind public.hospitality_property_kind not null default 'hotel',
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
  constraint hospitality_properties_identity_key unique (id, tenant_id)
);
create unique index hospitality_property_name_idx
  on public.hospitality_properties (tenant_id, lower(name));
create index hospitality_property_tenant_idx on public.hospitality_properties (tenant_id, is_active);

grant select on public.hospitality_properties to authenticated;
grant all on public.hospitality_properties to service_role;
alter table public.hospitality_properties enable row level security;
create policy "Elevated roles read properties" on public.hospitality_properties
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- 2 · STAYS — one operation staying at one property
-- =====================================================================
create table public.hospitality_stays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  property_id uuid not null references public.hospitality_properties(id),
  name text not null,
  status public.hospitality_stay_status not null default 'draft',
  planned_check_in timestamptz not null,
  planned_check_out timestamptz not null,
  expected_check_in timestamptz,
  expected_check_out timestamptz,
  checkin_opened_at timestamptz,
  checkout_completed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hospitality_stays_identity_key unique (id, tenant_id),
  constraint hospitality_stays_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint hospitality_stays_property_fk
    foreign key (property_id, tenant_id) references public.hospitality_properties(id, tenant_id),
  constraint hospitality_stays_window check (planned_check_out > planned_check_in)
);
create index hospitality_stay_operation_idx on public.hospitality_stays (operation_id, planned_check_in);
create index hospitality_stay_tenant_idx on public.hospitality_stays (tenant_id, status);

grant select on public.hospitality_stays to authenticated;
grant all on public.hospitality_stays to service_role;
alter table public.hospitality_stays enable row level security;
create policy "Elevated roles read stays" on public.hospitality_stays
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- 3 · ROOMS — contracted unit for THIS stay (never bed-level)
-- =====================================================================
create table public.hospitality_rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stay_id uuid not null references public.hospitality_stays(id) on delete cascade,
  label text not null,
  capacity integer not null default 1,
  room_status public.hospitality_room_status not null default 'available',
  floor_label text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hospitality_rooms_identity_key unique (id, tenant_id),
  constraint hospitality_rooms_stay_fk
    foreign key (stay_id, tenant_id) references public.hospitality_stays(id, tenant_id),
  constraint hospitality_rooms_capacity check (capacity > 0 and capacity <= 64)
);
create unique index hospitality_room_label_idx on public.hospitality_rooms (stay_id, lower(label));
create index hospitality_room_stay_idx on public.hospitality_rooms (stay_id, room_status);

grant select on public.hospitality_rooms to authenticated;
grant all on public.hospitality_rooms to service_role;
alter table public.hospitality_rooms enable row level security;
create policy "Elevated roles read rooms" on public.hospitality_rooms
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- 4 · STAY PARTICIPATIONS — hospitality manifest (history preserved)
-- =====================================================================
create table public.hospitality_stay_participations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stay_id uuid not null references public.hospitality_stays(id) on delete cascade,
  participation_id uuid not null references public.operation_participations(id),
  is_active boolean not null default true,
  removed_at timestamptz,
  removal_reason text,
  restored_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hospitality_stay_participations_identity_key unique (id, tenant_id),
  constraint hospitality_stay_participations_stay_fk
    foreign key (stay_id, tenant_id) references public.hospitality_stays(id, tenant_id),
  constraint hospitality_stay_participations_participation_fk
    foreign key (participation_id, tenant_id)
    references public.operation_participations(id, tenant_id),
  constraint hospitality_stay_participations_unique unique (stay_id, participation_id)
);
create index hospitality_stay_participation_idx
  on public.hospitality_stay_participations (stay_id, is_active);

grant select on public.hospitality_stay_participations to authenticated;
grant all on public.hospitality_stay_participations to service_role;
alter table public.hospitality_stay_participations enable row level security;
create policy "Elevated roles read stay participations" on public.hospitality_stay_participations
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- 5 · ROOM ASSIGNMENTS — append-and-release, never deleted
-- =====================================================================
create table public.hospitality_room_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stay_id uuid not null references public.hospitality_stays(id) on delete cascade,
  room_id uuid not null references public.hospitality_rooms(id),
  stay_participation_id uuid not null references public.hospitality_stay_participations(id),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  released_at timestamptz,
  released_by uuid references public.profiles(id),
  release_reason text,
  overcapacity_override boolean not null default false,
  override_reason text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hospitality_room_assignments_stay_fk
    foreign key (stay_id, tenant_id) references public.hospitality_stays(id, tenant_id),
  constraint hospitality_room_assignments_room_fk
    foreign key (room_id, tenant_id) references public.hospitality_rooms(id, tenant_id),
  constraint hospitality_room_assignments_participation_fk
    foreign key (stay_participation_id, tenant_id)
    references public.hospitality_stay_participations(id, tenant_id)
);
create unique index hospitality_room_assignment_open_guest_idx
  on public.hospitality_room_assignments (stay_participation_id)
  where released_at is null;
create index hospitality_room_assignment_room_idx
  on public.hospitality_room_assignments (room_id, released_at);
create index hospitality_room_assignment_stay_idx
  on public.hospitality_room_assignments (stay_id, released_at);

grant select on public.hospitality_room_assignments to authenticated;
grant all on public.hospitality_room_assignments to service_role;
alter table public.hospitality_room_assignments enable row level security;
create policy "Elevated roles read room assignments" on public.hospitality_room_assignments
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- 6 · HOSPITALITY EVENTS — append-only canonical truth
-- =====================================================================
create table public.hospitality_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  stay_id uuid not null references public.hospitality_stays(id) on delete cascade,
  room_id uuid references public.hospitality_rooms(id),
  stay_participation_id uuid references public.hospitality_stay_participations(id),
  room_assignment_id uuid references public.hospitality_room_assignments(id),
  event_type public.hospitality_event_type not null,
  actor_profile_id uuid references public.profiles(id),
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  note text,
  context jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint hospitality_events_stay_fk
    foreign key (stay_id, tenant_id) references public.hospitality_stays(id, tenant_id),
  constraint hospitality_events_room_fk
    foreign key (room_id, tenant_id) references public.hospitality_rooms(id, tenant_id),
  constraint hospitality_events_participation_fk
    foreign key (stay_participation_id, tenant_id)
    references public.hospitality_stay_participations(id, tenant_id)
);
create index hospitality_event_stay_idx on public.hospitality_events (stay_id, occurred_at desc);
create index hospitality_event_guest_idx
  on public.hospitality_events (stay_participation_id, occurred_at desc);
create index hospitality_event_correlation_idx on public.hospitality_events (correlation_id);

grant select on public.hospitality_events to authenticated;
grant all on public.hospitality_events to service_role;
alter table public.hospitality_events enable row level security;
create policy "Elevated roles read hospitality events" on public.hospitality_events
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- =====================================================================
-- GUARDS — no direct DML, ever
-- =====================================================================
create or replace function app_private.w06_control_active()
returns boolean language sql stable set search_path = 'pg_catalog','public' as $$
  select coalesce(current_setting('app.w06_control', true), 'off') = 'on'
$$;

create or replace function public.guard_w06_mutation()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  if app_private.w06_control_active() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Hospitality data can only change through the approved commands';
end;
$$;

create or replace function public.guard_w06_append_only()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create or replace function public.guard_hospitality_stay_baseline()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.operation_id is distinct from old.operation_id
     or new.property_id is distinct from old.property_id then
    raise exception 'A stay cannot be moved between organizations, operations or properties';
  end if;
  if old.status <> 'draft'
     and (new.planned_check_in is distinct from old.planned_check_in
          or new.planned_check_out is distinct from old.planned_check_out) then
    raise exception 'The stay baseline is frozen once confirmed. Use the expected window instead.';
  end if;
  return new;
end;
$$;

create or replace function public.guard_hospitality_room_assignment()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  if old.released_at is not null then
    raise exception 'A released room assignment is historical evidence and cannot change';
  end if;
  if new.room_id is distinct from old.room_id
     or new.stay_participation_id is distinct from old.stay_participation_id
     or new.assigned_at is distinct from old.assigned_at then
    raise exception 'A room assignment cannot be rewritten. Release it and assign a new room.';
  end if;
  return new;
end;
$$;

create trigger hospitality_properties_guard before insert or update or delete
  on public.hospitality_properties for each row execute function public.guard_w06_mutation();
create trigger hospitality_properties_updated_at before update
  on public.hospitality_properties for each row execute function public.set_updated_at();

create trigger hospitality_stays_guard before insert or update or delete
  on public.hospitality_stays for each row execute function public.guard_w06_mutation();
create trigger hospitality_stays_baseline before update
  on public.hospitality_stays for each row execute function public.guard_hospitality_stay_baseline();
create trigger hospitality_stays_updated_at before update
  on public.hospitality_stays for each row execute function public.set_updated_at();

create trigger hospitality_rooms_guard before insert or update or delete
  on public.hospitality_rooms for each row execute function public.guard_w06_mutation();
create trigger hospitality_rooms_updated_at before update
  on public.hospitality_rooms for each row execute function public.set_updated_at();

create trigger hospitality_stay_participations_guard before insert or update or delete
  on public.hospitality_stay_participations for each row execute function public.guard_w06_mutation();
create trigger hospitality_stay_participations_updated_at before update
  on public.hospitality_stay_participations for each row execute function public.set_updated_at();

create trigger hospitality_room_assignments_guard before insert or update or delete
  on public.hospitality_room_assignments for each row execute function public.guard_w06_mutation();
create trigger hospitality_room_assignments_history before update
  on public.hospitality_room_assignments for each row
  execute function public.guard_hospitality_room_assignment();
create trigger hospitality_room_assignments_updated_at before update
  on public.hospitality_room_assignments for each row execute function public.set_updated_at();

create trigger hospitality_events_guard before insert
  on public.hospitality_events for each row execute function public.guard_w06_mutation();
create trigger hospitality_events_append_only before update or delete
  on public.hospitality_events for each row execute function public.guard_w06_append_only();