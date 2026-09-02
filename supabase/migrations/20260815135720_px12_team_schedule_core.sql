-- =====================================================================
-- COBS OS · PX12.4-B · Team Schedule Core
-- Operational staffing windows only. This is NOT payroll, timekeeping or HR.
-- Canonical model: participation + operation role + staffing window + events.
-- =====================================================================

create type public.staff_assignment_status as enum (
  'assigned',
  'confirmed',
  'declined',
  'cancelled',
  'completed'
);

create type public.staff_assignment_event_type as enum (
  'created',
  'rescheduled',
  'confirmed',
  'declined',
  'cancelled',
  'completed'
);

create table public.operation_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  participation_id uuid not null,
  role_type_id uuid not null,
  report_at timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.staff_assignment_status not null default 'assigned',
  confirmed_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operation_staff_assignments_operation_fk
    foreign key (operation_id, tenant_id)
    references public.operations (id, tenant_id) on delete restrict,
  constraint operation_staff_assignments_participation_fk
    foreign key (participation_id, tenant_id)
    references public.operation_participations (id, tenant_id) on delete restrict,
  constraint operation_staff_assignments_role_type_fk
    foreign key (role_type_id, tenant_id)
    references public.operation_role_types (id, tenant_id) on delete restrict,
  constraint operation_staff_assignments_window_check check (ends_at > starts_at),
  constraint operation_staff_assignments_report_check check (report_at is null or report_at <= starts_at),
  constraint operation_staff_assignments_confirmed_check check ((status = 'confirmed') = (confirmed_at is not null)),
  constraint operation_staff_assignments_declined_check check ((status = 'declined') = (declined_at is not null)),
  constraint operation_staff_assignments_cancelled_check check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint operation_staff_assignments_completed_check check ((status = 'completed') = (completed_at is not null))
);

create unique index operation_staff_assignments_identity_key
  on public.operation_staff_assignments (id, tenant_id);
create index operation_staff_assignments_operation_idx
  on public.operation_staff_assignments (tenant_id, operation_id, starts_at);
create index operation_staff_assignments_participation_idx
  on public.operation_staff_assignments (tenant_id, participation_id, starts_at);
create index operation_staff_assignments_role_idx
  on public.operation_staff_assignments (tenant_id, role_type_id, starts_at);
create index operation_staff_assignments_active_window_idx
  on public.operation_staff_assignments (tenant_id, starts_at, ends_at)
  where status in ('assigned','confirmed');

create trigger operation_staff_assignments_updated_at
  before update on public.operation_staff_assignments
  for each row execute function public.set_updated_at();

create table public.staff_assignment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid not null,
  operation_id uuid not null,
  participation_id uuid not null,
  event_type public.staff_assignment_event_type not null,
  previous_starts_at timestamptz,
  previous_ends_at timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  actor_profile_id uuid references public.profiles(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint staff_assignment_events_assignment_fk
    foreign key (assignment_id, tenant_id)
    references public.operation_staff_assignments (id, tenant_id) on delete restrict,
  constraint staff_assignment_events_operation_fk
    foreign key (operation_id, tenant_id)
    references public.operations (id, tenant_id) on delete restrict,
  constraint staff_assignment_events_participation_fk
    foreign key (participation_id, tenant_id)
    references public.operation_participations (id, tenant_id) on delete restrict,
  constraint staff_assignment_events_window_check check (ends_at > starts_at)
);

create index staff_assignment_events_assignment_idx
  on public.staff_assignment_events (tenant_id, assignment_id, occurred_at desc);
create index staff_assignment_events_operation_idx
  on public.staff_assignment_events (tenant_id, operation_id, occurred_at desc);

grant select on public.operation_staff_assignments to authenticated;
grant select on public.staff_assignment_events to authenticated;
grant all on public.operation_staff_assignments, public.staff_assignment_events to service_role;

alter table public.operation_staff_assignments enable row level security;
alter table public.staff_assignment_events enable row level security;

create policy operation_staff_assignments_select_member
  on public.operation_staff_assignments for select to authenticated
  using (app_private.is_tenant_member(tenant_id));

create policy staff_assignment_events_select_member
  on public.staff_assignment_events for select to authenticated
  using (app_private.is_tenant_member(tenant_id));

create or replace function app_private.assert_staff_assignment_context(
  _tenant_id uuid,
  _operation_id uuid,
  _participation_id uuid,
  _role_type_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  _participation_status public.participation_status;
begin
  select p.status
    into _participation_status
  from public.operation_participations p
  where p.id = _participation_id
    and p.tenant_id = _tenant_id
    and p.operation_id = _operation_id;

  if not found then
    raise exception 'Participation does not belong to this operation';
  end if;

  if _participation_status = 'cancelled' then
    raise exception 'Cancelled participation cannot be scheduled';
  end if;

  if not exists (
    select 1
    from public.operation_role_assignments a
    where a.tenant_id = _tenant_id
      and a.participation_id = _participation_id
      and a.role_type_id = _role_type_id
  ) then
    raise exception 'Role is not assigned to this participation';
  end if;
end;
$$;

revoke all on function app_private.assert_staff_assignment_context(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;

create or replace function app_private.staff_assignment_has_conflict(
  _tenant_id uuid,
  _participation_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _exclude_assignment_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.operation_staff_assignments a
    where a.tenant_id = _tenant_id
      and a.participation_id = _participation_id
      and a.status in ('assigned','confirmed')
      and (_exclude_assignment_id is null or a.id <> _exclude_assignment_id)
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(_starts_at, _ends_at, '[)')
  )
$$;

revoke all on function app_private.staff_assignment_has_conflict(uuid,uuid,timestamptz,timestamptz,uuid)
  from public, anon, authenticated;

create or replace function public.save_operation_staff_assignment(
  _tenant_id uuid,
  _operation_id uuid,
  _participation_id uuid,
  _role_type_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _report_at timestamptz default null,
  _notes text default null,
  _assignment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _id uuid;
  _old public.operation_staff_assignments%rowtype;
  _event public.staff_assignment_event_type;
begin
  if not app_private.has_tenant_role(
    _tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then
    raise exception 'Not authorized to manage team schedule';
  end if;

  if _ends_at <= _starts_at then
    raise exception 'Schedule end must be after start';
  end if;
  if _report_at is not null and _report_at > _starts_at then
    raise exception 'Report time cannot be after schedule start';
  end if;

  perform app_private.assert_staff_assignment_context(
    _tenant_id, _operation_id, _participation_id, _role_type_id
  );

  if app_private.staff_assignment_has_conflict(
    _tenant_id, _participation_id, _starts_at, _ends_at, _assignment_id
  ) then
    raise exception 'Schedule conflict: this person already has an overlapping active assignment';
  end if;

  if _assignment_id is null then
    insert into public.operation_staff_assignments (
      tenant_id, operation_id, participation_id, role_type_id,
      report_at, starts_at, ends_at, notes, created_by, updated_by
    ) values (
      _tenant_id, _operation_id, _participation_id, _role_type_id,
      _report_at, _starts_at, _ends_at, nullif(btrim(_notes), ''), auth.uid(), auth.uid()
    ) returning id into _id;
    _event := 'created';
  else
    select * into _old
    from public.operation_staff_assignments
    where id = _assignment_id and tenant_id = _tenant_id
    for update;

    if not found then
      raise exception 'Staff assignment not found';
    end if;
    if _old.status not in ('assigned','confirmed') then
      raise exception 'Only active assignments can be rescheduled';
    end if;

    update public.operation_staff_assignments
    set operation_id = _operation_id,
        participation_id = _participation_id,
        role_type_id = _role_type_id,
        report_at = _report_at,
        starts_at = _starts_at,
        ends_at = _ends_at,
        notes = nullif(btrim(_notes), ''),
        updated_by = auth.uid()
    where id = _assignment_id and tenant_id = _tenant_id;

    _id := _assignment_id;
    _event := 'rescheduled';
  end if;

  insert into public.staff_assignment_events (
    tenant_id, assignment_id, operation_id, participation_id, event_type,
    previous_starts_at, previous_ends_at, starts_at, ends_at, note, actor_profile_id
  ) values (
    _tenant_id, _id, _operation_id, _participation_id, _event,
    case when _event = 'rescheduled' then _old.starts_at else null end,
    case when _event = 'rescheduled' then _old.ends_at else null end,
    _starts_at, _ends_at, nullif(btrim(_notes), ''), auth.uid()
  );

  return _id;
end;
$$;

revoke all on function public.save_operation_staff_assignment(uuid,uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,text,uuid)
  from public, anon;
grant execute on function public.save_operation_staff_assignment(uuid,uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,text,uuid)
  to authenticated;

create or replace function public.set_operation_staff_assignment_status(
  _assignment_id uuid,
  _status public.staff_assignment_status,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _row public.operation_staff_assignments%rowtype;
  _event public.staff_assignment_event_type;
  _manager boolean;
  _self boolean;
begin
  select * into _row
  from public.operation_staff_assignments
  where id = _assignment_id
  for update;

  if not found then
    raise exception 'Staff assignment not found';
  end if;

  _manager := app_private.has_tenant_role(
    _row.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  );

  select exists (
    select 1
    from public.operation_participations p
    join public.people pe on pe.id = p.person_id and pe.tenant_id = p.tenant_id
    where p.id = _row.participation_id
      and p.tenant_id = _row.tenant_id
      and pe.profile_id = auth.uid()
  ) into _self;

  if _status in ('confirmed','declined') then
    if not (_manager or _self) then
      raise exception 'Not authorized to respond to this assignment';
    end if;
  elsif not _manager then
    raise exception 'Not authorized to change this assignment status';
  end if;

  if _row.status in ('cancelled','completed') then
    raise exception 'Closed assignment cannot change status';
  end if;

  if _status = 'assigned' then
    raise exception 'Use save_operation_staff_assignment to create or reschedule assignments';
  end if;

  _event := case _status
    when 'confirmed' then 'confirmed'::public.staff_assignment_event_type
    when 'declined' then 'declined'::public.staff_assignment_event_type
    when 'cancelled' then 'cancelled'::public.staff_assignment_event_type
    when 'completed' then 'completed'::public.staff_assignment_event_type
    else null
  end;

  update public.operation_staff_assignments
  set status = _status,
      confirmed_at = case when _status = 'confirmed' then now() else null end,
      declined_at = case when _status = 'declined' then now() else null end,
      cancelled_at = case when _status = 'cancelled' then now() else null end,
      completed_at = case when _status = 'completed' then now() else null end,
      updated_by = auth.uid()
  where id = _assignment_id;

  insert into public.staff_assignment_events (
    tenant_id, assignment_id, operation_id, participation_id, event_type,
    starts_at, ends_at, note, actor_profile_id
  ) values (
    _row.tenant_id, _row.id, _row.operation_id, _row.participation_id, _event,
    _row.starts_at, _row.ends_at, nullif(btrim(_note), ''), auth.uid()
  );
end;
$$;

revoke all on function public.set_operation_staff_assignment_status(uuid,public.staff_assignment_status,text)
  from public, anon;
grant execute on function public.set_operation_staff_assignment_status(uuid,public.staff_assignment_status,text)
  to authenticated;

create or replace function public.get_operation_staff_assignment_conflicts(
  _tenant_id uuid,
  _from timestamptz,
  _to timestamptz
)
returns table (
  participation_id uuid,
  assignment_id uuid,
  conflicting_assignment_id uuid,
  overlap_start timestamptz,
  overlap_end timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select
    a.participation_id,
    a.id,
    b.id,
    greatest(a.starts_at, b.starts_at),
    least(a.ends_at, b.ends_at)
  from public.operation_staff_assignments a
  join public.operation_staff_assignments b
    on b.tenant_id = a.tenant_id
   and b.participation_id = a.participation_id
   and b.id > a.id
   and b.status in ('assigned','confirmed')
   and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(a.starts_at, a.ends_at, '[)')
  where a.tenant_id = _tenant_id
    and a.status in ('assigned','confirmed')
    and a.starts_at < _to
    and a.ends_at > _from
$$;

revoke all on function public.get_operation_staff_assignment_conflicts(uuid,timestamptz,timestamptz)
  from public, anon;
grant execute on function public.get_operation_staff_assignment_conflicts(uuid,timestamptz,timestamptz)
  to authenticated;

comment on table public.operation_staff_assignments is
  'Operational staffing windows for a person-role inside an operation. Not payroll/timekeeping.';
comment on table public.staff_assignment_events is
  'Append-only audit trail of staffing assignment lifecycle and rescheduling.';