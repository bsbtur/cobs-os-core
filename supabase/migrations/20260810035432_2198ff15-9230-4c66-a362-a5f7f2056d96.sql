-- =====================================================================
-- COBS OS · W03 — People · Participants · Crew · Contextual Roles
-- W01 and W02 semantics are untouched. Only additive supporting unique
-- keys are added to people/operations so composite tenant-safe foreign
-- keys are structurally possible.
-- =====================================================================

-- ---------- supporting identity keys (additive, no semantic change) ----------
alter table public.people
  add constraint people_identity_key unique (id, tenant_id);
alter table public.operations
  add constraint operations_identity_key unique (id, tenant_id);

-- ---------- enums ----------
create type public.participation_kind as enum ('participant', 'crew', 'support', 'observer');
create type public.participation_status as enum ('expected', 'confirmed', 'cancelled');

-- ---------- privacy guard ----------
create or replace function app_private.assert_generic_note(_value text)
returns void
language plpgsql
immutable
set search_path = 'pg_catalog', 'public'
as $$
begin
  if _value is null then
    return;
  end if;
  if length(_value) > 500 then
    raise exception 'Free-text notes are limited to 500 characters';
  end if;
  -- Generic notes are NOT storage for identity documents, health data,
  -- financial data or credentials. Reject the obvious carriers.
  if regexp_replace(_value, '\D', '', 'g') ~ '\d{9,}' then
    raise exception 'Free-text notes cannot store document, financial or identification numbers';
  end if;
  if _value ~* '(cpf|rg\M|passaporte|passport|cart[aã]o de cr[eé]dito|credit card|iban|token|senha|password|api[_ -]?key)' then
    raise exception 'Free-text notes cannot store sensitive personal, medical, financial or credential data';
  end if;
end;
$$;

-- ---------- role types ----------
create table public.operation_role_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  is_system boolean not null default false,
  label text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operation_role_types_key_format check (key ~ '^[a-z][a-z0-9_]{1,48}$'),
  constraint operation_role_types_tenant_key unique (tenant_id, key),
  constraint operation_role_types_identity_key unique (id, tenant_id)
);
comment on column public.operation_role_types.key is
  'Stable i18n-safe key. Labels are resolved in the application layer; custom types may override with label.';

grant select on public.operation_role_types to authenticated;
grant all on public.operation_role_types to service_role;
alter table public.operation_role_types enable row level security;
create policy operation_role_types_select_ops on public.operation_role_types
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- ---------- participations ----------
create table public.operation_participations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  person_id uuid not null,
  participation_kind public.participation_kind not null default 'participant',
  status public.participation_status not null default 'expected',
  notes text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  cancellation_count integer not null default 0,
  reactivated_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operation_participations_unique unique (operation_id, person_id),
  constraint operation_participations_identity_key unique (id, tenant_id),
  constraint operation_participations_operation_fk
    foreign key (operation_id, tenant_id)
    references public.operations (id, tenant_id) on delete cascade,
  constraint operation_participations_person_fk
    foreign key (person_id, tenant_id)
    references public.people (id, tenant_id) on delete cascade
);
comment on table public.operation_participations is
  'Roster membership only. PARTICIPATION != PHYSICAL PRESENCE: no-show, boarding and check-in are future runtime facts.';
comment on column public.operation_participations.notes is
  'Generic operational note. Never medical, dietary-medical, document, financial or credential data.';
comment on column public.operation_participations.cancellation_reason is
  'Evidence of the most recent cancellation. Preserved after reactivation.';

create index operation_participations_operation_idx
  on public.operation_participations (operation_id, status, participation_kind);
create index operation_participations_person_idx
  on public.operation_participations (tenant_id, person_id);

grant select on public.operation_participations to authenticated;
grant all on public.operation_participations to service_role;
alter table public.operation_participations enable row level security;
create policy operation_participations_select_ops on public.operation_participations
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- ---------- role assignments ----------
create table public.operation_role_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  participation_id uuid not null,
  role_type_id uuid not null,
  is_primary boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operation_role_assignments_unique unique (participation_id, role_type_id),
  constraint operation_role_assignments_participation_fk
    foreign key (participation_id, tenant_id)
    references public.operation_participations (id, tenant_id) on delete cascade,
  constraint operation_role_assignments_role_type_fk
    foreign key (role_type_id, tenant_id)
    references public.operation_role_types (id, tenant_id) on delete restrict
);
comment on table public.operation_role_assignments is
  'Contextual operational responsibility. Grants ZERO system access: authorization stays in W01 memberships.';

create unique index operation_role_assignments_primary_key
  on public.operation_role_assignments (participation_id) where is_primary;
create index operation_role_assignments_role_idx
  on public.operation_role_assignments (tenant_id, role_type_id);

grant select on public.operation_role_assignments to authenticated;
grant all on public.operation_role_assignments to service_role;
alter table public.operation_role_assignments enable row level security;
create policy operation_role_assignments_select_ops on public.operation_role_assignments
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

-- ---------- mutation boundary ----------
create or replace function app_private.w03_control_active()
returns boolean
language sql
stable
set search_path = 'pg_catalog', 'public'
as $$
  select coalesce(current_setting('app.w03_control', true), 'off') = 'on';
$$;

create or replace function public.guard_w03_mutation()
returns trigger
language plpgsql
set search_path = 'pg_catalog', 'public'
as $$
begin
  if app_private.w03_control_active() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'W03 roster data can only change through the approved commands';
end;
$$;

create trigger operation_role_types_guard
  before insert or update or delete on public.operation_role_types
  for each row execute function public.guard_w03_mutation();
create trigger operation_participations_guard
  before insert or update or delete on public.operation_participations
  for each row execute function public.guard_w03_mutation();
create trigger operation_role_assignments_guard
  before insert or update or delete on public.operation_role_assignments
  for each row execute function public.guard_w03_mutation();

create trigger operation_role_types_updated_at
  before update on public.operation_role_types
  for each row execute function public.set_updated_at();
create trigger operation_participations_updated_at
  before update on public.operation_participations
  for each row execute function public.set_updated_at();
create trigger operation_role_assignments_updated_at
  before update on public.operation_role_assignments
  for each row execute function public.set_updated_at();

-- ---------- canonical system role keys ----------
create or replace function app_private.w03_system_role_keys()
returns table (key text, sort_order integer)
language sql
immutable
set search_path = 'pg_catalog', 'public'
as $$
  select * from (values
    ('coordinator', 10), ('guide', 20), ('monitor', 30), ('driver', 40),
    ('professor', 50), ('academic_coordinator', 60), ('group_reference', 70),
    ('speaker', 80), ('photographer', 90), ('videomaker', 100),
    ('entertainer', 110), ('event_staff', 120), ('host', 130),
    ('supplier_contact', 140), ('hotel_contact', 150), ('restaurant_contact', 160),
    ('other', 999)
  ) as v(key, sort_order);
$$;

create or replace function app_private.provision_role_types(_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  _inserted integer;
begin
  perform set_config('app.w03_control', 'on', true);
  insert into public.operation_role_types (tenant_id, key, is_system, sort_order)
  select _tenant_id, k.key, true, k.sort_order
    from app_private.w03_system_role_keys() k
  on conflict (tenant_id, key) do nothing;
  get diagnostics _inserted = row_count;
  perform set_config('app.w03_control', 'off', true);
  return _inserted;
end;
$$;

-- Self-healing provisioning entry point used by every W03 surface.
create or replace function public.ensure_operation_role_types(_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  _uid uuid := auth.uid();
  _inserted integer;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to view this roster';
  end if;

  _inserted := app_private.provision_role_types(_tenant_id);

  if _inserted > 0 then
    perform app_private.record_audit_event(
      _tenant_id, _uid, 'operation_role_types.provisioned', 'operation_role_type', null, null,
      jsonb_build_object('created', _inserted)
    );
  end if;

  return jsonb_build_object('tenant_id', _tenant_id, 'created', _inserted);
end;
$$;

-- ---------- commands ----------
create or replace function public.add_operation_participation(
  _operation_id uuid,
  _person_id uuid,
  _participation_kind public.participation_kind,
  _idempotency_key text,
  _role_type_ids uuid[] default '{}',
  _primary_role_type_id uuid default null,
  _notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  _uid uuid := auth.uid();
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _existing jsonb;
  _op public.operations;
  _person public.people;
  _row public.operation_participations;
  _role uuid;
  _note text := nullif(btrim(coalesce(_notes, '')), '');
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this roster';
  end if;

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = _uid and k.action = 'participation.add' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  select * into _person from public.people p
    where p.id = _person_id and p.tenant_id = _op.tenant_id;
  if _person.id is null then raise exception 'Person not found in this organization'; end if;

  perform app_private.assert_generic_note(_note);
  perform app_private.provision_role_types(_op.tenant_id);

  perform set_config('app.w03_control', 'on', true);

  insert into public.operation_participations
    (tenant_id, operation_id, person_id, participation_kind, notes, created_by)
  values (_op.tenant_id, _operation_id, _person_id, _participation_kind, _note, _uid)
  on conflict (operation_id, person_id) do nothing
  returning * into _row;

  if _row.id is null then
    perform set_config('app.w03_control', 'off', true);
    raise exception 'This person is already on this operation roster';
  end if;

  foreach _role in array coalesce(_role_type_ids, '{}') loop
    insert into public.operation_role_assignments
      (tenant_id, participation_id, role_type_id, is_primary, created_by)
    select _op.tenant_id, _row.id, rt.id,
           (_primary_role_type_id is not null and rt.id = _primary_role_type_id), _uid
      from public.operation_role_types rt
      where rt.id = _role and rt.tenant_id = _op.tenant_id
    on conflict (participation_id, role_type_id) do nothing;
  end loop;

  perform set_config('app.w03_control', 'off', true);

  perform app_private.record_audit_event(
    _op.tenant_id, _uid, 'participation.added', 'operation_participation', _row.id, _key,
    jsonb_build_object('operation_id', _operation_id, 'participation_kind', _participation_kind,
                       'status', _row.status, 'roles', coalesce(array_length(_role_type_ids, 1), 0))
  );

  _existing := jsonb_build_object('participation_id', _row.id, 'tenant_id', _op.tenant_id,
                                  'operation_id', _operation_id, 'person_id', _person_id);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, _uid, 'participation.add', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.set_participation_status(
  _participation_id uuid,
  _status public.participation_status,
  _reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  _uid uuid := auth.uid();
  _row public.operation_participations;
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
  _action text;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _row from public.operation_participations p where p.id = _participation_id for update;
  if _row.id is null then raise exception 'Participation not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this roster';
  end if;
  if _row.status = _status then
    return jsonb_build_object('participation_id', _row.id, 'status', _row.status, 'unchanged', true);
  end if;
  if _status = 'cancelled' and _reason_clean is null then
    raise exception 'A reason is required to cancel a participation';
  end if;
  perform app_private.assert_generic_note(_reason_clean);

  _action := case
    when _status = 'cancelled' then 'participation.cancelled'
    when _row.status = 'cancelled' then 'participation.reactivated'
    when _status = 'confirmed' then 'participation.confirmed'
    else 'participation.status_changed'
  end;

  perform set_config('app.w03_control', 'on', true);
  update public.operation_participations set
    status = _status,
    confirmed_at = case when _status = 'confirmed' then now() else confirmed_at end,
    -- cancellation evidence is never erased by a later reactivation
    cancelled_at = case when _status = 'cancelled' then now() else cancelled_at end,
    cancellation_reason = case when _status = 'cancelled' then _reason_clean else cancellation_reason end,
    cancellation_count = case when _status = 'cancelled' then cancellation_count + 1 else cancellation_count end,
    reactivated_at = case when _row.status = 'cancelled' then now() else reactivated_at end
  where id = _row.id;
  perform set_config('app.w03_control', 'off', true);

  perform app_private.record_audit_event(
    _row.tenant_id, _uid, _action, 'operation_participation', _row.id, null,
    jsonb_build_object('operation_id', _row.operation_id, 'from_status', _row.status,
                       'to_status', _status, 'reason', _reason_clean)
  );

  return jsonb_build_object('participation_id', _row.id, 'status', _status);
end;
$$;

create or replace function public.assign_operation_role(
  _participation_id uuid,
  _role_type_id uuid,
  _is_primary boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  _uid uuid := auth.uid();
  _row public.operation_participations;
  _type public.operation_role_types;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _row from public.operation_participations p where p.id = _participation_id;
  if _row.id is null then raise exception 'Participation not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this roster';
  end if;

  select * into _type from public.operation_role_types rt
    where rt.id = _role_type_id and rt.tenant_id = _row.tenant_id and rt.is_active;
  if _type.id is null then raise exception 'Role not available in this organization'; end if;

  perform set_config('app.w03_control', 'on', true);
  if _is_primary then
    update public.operation_role_assignments set is_primary = false
      where participation_id = _row.id and is_primary;
  end if;
  insert into public.operation_role_assignments
    (tenant_id, participation_id, role_type_id, is_primary, created_by)
  values (_row.tenant_id, _row.id, _role_type_id, coalesce(_is_primary, false), _uid)
  on conflict (participation_id, role_type_id)
    do update set is_primary = excluded.is_primary;
  perform set_config('app.w03_control', 'off', true);

  perform app_private.record_audit_event(
    _row.tenant_id, _uid, 'participation.role_assigned', 'operation_participation', _row.id, null,
    jsonb_build_object('role_key', _type.key, 'is_primary', coalesce(_is_primary, false))
  );

  return jsonb_build_object('participation_id', _row.id, 'role_type_id', _role_type_id);
end;
$$;

create or replace function public.unassign_operation_role(
  _participation_id uuid,
  _role_type_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  _uid uuid := auth.uid();
  _row public.operation_participations;
  _type public.operation_role_types;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _row from public.operation_participations p where p.id = _participation_id;
  if _row.id is null then raise exception 'Participation not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this roster';
  end if;

  select * into _type from public.operation_role_types rt where rt.id = _role_type_id;

  perform set_config('app.w03_control', 'on', true);
  delete from public.operation_role_assignments
    where participation_id = _row.id and role_type_id = _role_type_id;
  perform set_config('app.w03_control', 'off', true);

  perform app_private.record_audit_event(
    _row.tenant_id, _uid, 'participation.role_unassigned', 'operation_participation', _row.id, null,
    jsonb_build_object('role_key', _type.key)
  );

  return jsonb_build_object('participation_id', _row.id, 'role_type_id', _role_type_id);
end;
$$;

create or replace function public.set_primary_operation_role(
  _participation_id uuid,
  _role_type_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $$
declare
  _uid uuid := auth.uid();
  _row public.operation_participations;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _row from public.operation_participations p where p.id = _participation_id;
  if _row.id is null then raise exception 'Participation not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this roster';
  end if;
  if _role_type_id is not null and not exists (
    select 1 from public.operation_role_assignments a
      where a.participation_id = _row.id and a.role_type_id = _role_type_id
  ) then
    raise exception 'That role is not assigned to this person';
  end if;

  perform set_config('app.w03_control', 'on', true);
  update public.operation_role_assignments set is_primary = false
    where participation_id = _row.id and is_primary;
  if _role_type_id is not null then
    update public.operation_role_assignments set is_primary = true
      where participation_id = _row.id and role_type_id = _role_type_id;
  end if;
  perform set_config('app.w03_control', 'off', true);

  perform app_private.record_audit_event(
    _row.tenant_id, _uid, 'participation.primary_role_changed', 'operation_participation', _row.id, null,
    jsonb_build_object('role_type_id', _role_type_id)
  );

  return jsonb_build_object('participation_id', _row.id, 'primary_role_type_id', _role_type_id);
end;
$$;

-- ---------- backfill for existing tenants ----------
do $$
declare
  _t uuid;
begin
  for _t in select id from public.tenants loop
    perform app_private.provision_role_types(_t);
  end loop;
end;
$$;
