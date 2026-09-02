-- =====================================================================
-- COBS OS · W02 · Experience / Offering / Operation core
-- Additive only. No W01 object is modified.
-- =====================================================================

-- ------------------------------ enums --------------------------------
create type public.experience_kind as enum ('tourism', 'event', 'hybrid');
create type public.experience_status as enum ('draft', 'active', 'archived');
create type public.offering_status as enum ('draft', 'active', 'paused', 'archived');
create type public.operation_status as enum ('draft', 'planning', 'ready', 'active', 'completed', 'cancelled');

-- --------------------------- experiences -----------------------------
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  short_description text,
  description text,
  experience_kind public.experience_kind not null default 'tourism',
  category_tags text[] not null default '{}',
  status public.experience_status not null default 'draft',
  default_locale text not null default 'pt-BR',
  default_timezone text not null default 'America/Sao_Paulo',
  country_code char(2),
  region text,
  city text,
  -- EXTENSION-ONLY: never the sole source of truth for authorization,
  -- lifecycle, relationships, money, capacity, availability, temporal
  -- integrity, referential integrity or any business invariant.
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experiences_name_len check (char_length(btrim(name)) between 2 and 160),
  constraint experiences_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  constraint experiences_country_format check (country_code is null or country_code ~ '^[A-Z]{2}$')
);
create unique index experiences_tenant_slug_key on public.experiences (tenant_id, lower(slug));
create unique index experiences_tenant_id_key on public.experiences (id, tenant_id);
create index experiences_tenant_status_idx on public.experiences (tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.experiences TO authenticated;
GRANT ALL ON public.experiences TO service_role;
alter table public.experiences enable row level security;

create trigger experiences_updated_at before update on public.experiences
  for each row execute function public.set_updated_at();

create policy experiences_select_member on public.experiences for select to authenticated
  using (app_private.is_tenant_member(tenant_id));
create policy experiences_insert_owner_admin on public.experiences for insert to authenticated
  with check (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));
create policy experiences_update_owner_admin on public.experiences for update to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]))
  with check (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));
create policy experiences_delete_owner_admin on public.experiences for delete to authenticated
  using (
    app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[])
    and status = 'draft'
  );

-- ----------------------------- offerings -----------------------------
create table public.offerings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  experience_id uuid not null,
  name text not null,
  slug text not null,
  status public.offering_status not null default 'draft',
  available_from timestamptz,
  available_until timestamptz,
  sales_start timestamptz,
  sales_end timestamptz,
  capacity integer,
  currency_code char(3),
  -- EXTENSION-ONLY (see experiences.metadata).
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offerings_experience_fk
    foreign key (experience_id, tenant_id)
    references public.experiences (id, tenant_id) on delete restrict,
  constraint offerings_name_len check (char_length(btrim(name)) between 2 and 160),
  constraint offerings_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  constraint offerings_capacity_positive check (capacity is null or capacity > 0),
  constraint offerings_currency_format check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  constraint offerings_available_window check (available_from is null or available_until is null or available_until >= available_from),
  constraint offerings_sales_window check (sales_start is null or sales_end is null or sales_end >= sales_start)
);
create unique index offerings_tenant_experience_slug_key
  on public.offerings (tenant_id, experience_id, lower(slug));
create unique index offerings_identity_key
  on public.offerings (id, tenant_id, experience_id);
create index offerings_experience_idx on public.offerings (experience_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offerings TO authenticated;
GRANT ALL ON public.offerings TO service_role;
alter table public.offerings enable row level security;

create trigger offerings_updated_at before update on public.offerings
  for each row execute function public.set_updated_at();

create policy offerings_select_member on public.offerings for select to authenticated
  using (app_private.is_tenant_member(tenant_id));
create policy offerings_insert_owner_admin on public.offerings for insert to authenticated
  with check (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));
create policy offerings_update_owner_admin on public.offerings for update to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]))
  with check (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));
create policy offerings_delete_owner_admin on public.offerings for delete to authenticated
  using (
    app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[])
    and status = 'draft'
  );

-- ----------------------------- operations ----------------------------
create table public.operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  experience_id uuid,
  offering_id uuid,
  name text not null,
  code text not null,
  operation_kind public.experience_kind not null default 'tourism',
  status public.operation_status not null default 'draft',
  primary_country char(2) not null,
  primary_region text,
  primary_city text,
  timezone text not null,
  planned_start timestamptz not null,
  planned_end timestamptz not null,
  expected_start timestamptz,
  expected_end timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  archived_at timestamptz,
  -- Historical snapshot: lineage names captured at creation, never auto-synced.
  source_experience_name text,
  source_offering_name text,
  -- EXTENSION-ONLY (see experiences.metadata).
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_experience_fk
    foreign key (experience_id, tenant_id)
    references public.experiences (id, tenant_id) on delete restrict,
  constraint operations_offering_fk
    foreign key (offering_id, tenant_id, experience_id)
    references public.offerings (id, tenant_id, experience_id) on delete restrict,
  -- offering implies experience (MATCH SIMPLE composite FK is skipped on nulls)
  constraint operations_offering_requires_experience
    check (offering_id is null or experience_id is not null),
  constraint operations_name_len check (char_length(btrim(name)) between 2 and 160),
  constraint operations_code_format check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,46}[A-Za-z0-9]$'),
  constraint operations_country_format check (primary_country ~ '^[A-Z]{2}$'),
  constraint operations_planned_window check (planned_end >= planned_start),
  constraint operations_expected_window check (expected_start is null or expected_end is null or expected_end >= expected_start),
  constraint operations_completed_consistency check ((status = 'completed') = (completed_at is not null)),
  constraint operations_cancelled_consistency check ((status = 'cancelled') = (cancelled_at is not null))
);
create unique index operations_tenant_code_key on public.operations (tenant_id, lower(code));
create index operations_tenant_status_idx on public.operations (tenant_id, status);
create index operations_experience_idx on public.operations (experience_id);
create index operations_offering_idx on public.operations (offering_id);
create index operations_tenant_planned_start_idx on public.operations (tenant_id, planned_start);

GRANT SELECT, INSERT, UPDATE ON public.operations TO authenticated;
GRANT ALL ON public.operations TO service_role;
alter table public.operations enable row level security;

create trigger operations_updated_at before update on public.operations
  for each row execute function public.set_updated_at();

create policy operations_select_member on public.operations for select to authenticated
  using (app_private.is_tenant_member(tenant_id));
create policy operations_insert_ops on public.operations for insert to authenticated
  with check (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));
create policy operations_update_ops on public.operations for update to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]))
  with check (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));
-- No DELETE policy and no DELETE grant: operations are never hard-deleted.

-- ================= controlled mutation boundary =======================
-- Protected columns may only change inside the canonical SECURITY DEFINER
-- commands, which set the app.op_control flag for the duration of the call.
create or replace function app_private.op_control_active()
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$ select coalesce(current_setting('app.op_control', true), 'off') = 'on' $$;

revoke all on function app_private.op_control_active() from public, anon, authenticated;

create or replace function public.guard_operation_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if app_private.op_control_active() then
    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'An operation cannot be moved between organizations';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Operation status can only change through set_operation_status';
  end if;
  if new.planned_start is distinct from old.planned_start
     or new.planned_end is distinct from old.planned_end then
    raise exception 'The planned window can only change through set_operation_planned_window';
  end if;
  if new.expected_start is distinct from old.expected_start
     or new.expected_end is distinct from old.expected_end then
    raise exception 'The expected window can only change through set_operation_expected_window';
  end if;
  if new.completed_at is distinct from old.completed_at
     or new.cancelled_at is distinct from old.cancelled_at
     or new.cancellation_reason is distinct from old.cancellation_reason then
    raise exception 'Completion and cancellation facts are set by lifecycle transitions only';
  end if;
  if new.archived_at is distinct from old.archived_at then
    raise exception 'Archival can only change through set_operation_archived';
  end if;
  if new.code is distinct from old.code then
    raise exception 'The operation code is immutable';
  end if;
  if new.experience_id is distinct from old.experience_id
     or new.offering_id is distinct from old.offering_id then
    raise exception 'Operation lineage is immutable';
  end if;

  return new;
end;
$$;

create trigger operations_guard before update on public.operations
  for each row execute function public.guard_operation_mutation();

-- ===================== catalog audit triggers =========================
create or replace function public.audit_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _subject text := tg_argv[0];
  _changed text[] := '{}';
  _col text;
  _old jsonb := to_jsonb(old);
  _new jsonb := to_jsonb(new);
begin
  for _col in select jsonb_object_keys(_new) loop
    if _col not in ('updated_at') and (_old -> _col) is distinct from (_new -> _col) then
      _changed := _changed || _col;
    end if;
  end loop;

  if array_length(_changed, 1) is null then
    return new;
  end if;

  perform app_private.record_audit_event(
    new.tenant_id, auth.uid(),
    case
      when _subject = 'experience' and new.status = 'archived' and old.status is distinct from 'archived'
        then 'experience.archived'
      when _subject = 'offering' and new.status is distinct from old.status
        then 'offering.status_changed'
      else _subject || '.updated'
    end,
    _subject, new.id, null,
    jsonb_build_object('changed_fields', to_jsonb(_changed), 'status', new.status)
  );
  return new;
end;
$$;

create trigger experiences_audit after update on public.experiences
  for each row execute function public.audit_catalog_change('experience');
create trigger offerings_audit after update on public.offerings
  for each row execute function public.audit_catalog_change('offering');

-- ======================= canonical commands ===========================

-- ---- create_experience ----
create or replace function public.create_experience(
  _tenant_id uuid,
  _name text,
  _slug text,
  _experience_kind public.experience_kind,
  _idempotency_key text,
  _short_description text default null,
  _description text default null,
  _country_code text default null,
  _region text default null,
  _city text default null,
  _default_locale text default null,
  _default_timezone text default null,
  _category_tags text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _existing jsonb;
  _row public.experiences;
  _tenant public.tenants;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins can create experiences';
  end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = _uid and k.action = 'experience.create' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  select * into _tenant from public.tenants t where t.id = _tenant_id;

  insert into public.experiences (
    tenant_id, name, slug, short_description, description, experience_kind,
    category_tags, default_locale, default_timezone, country_code, region, city, created_by
  ) values (
    _tenant_id, btrim(_name), lower(btrim(_slug)), nullif(btrim(coalesce(_short_description,'')),''),
    nullif(btrim(coalesce(_description,'')),''), _experience_kind,
    coalesce(_category_tags, '{}'),
    coalesce(nullif(btrim(coalesce(_default_locale,'')),''), _tenant.default_locale),
    coalesce(nullif(btrim(coalesce(_default_timezone,'')),''), _tenant.timezone),
    nullif(upper(btrim(coalesce(_country_code,''))),''),
    nullif(btrim(coalesce(_region,'')),''),
    nullif(btrim(coalesce(_city,'')),''),
    _uid
  ) returning * into _row;

  perform app_private.record_audit_event(
    _tenant_id, _uid, 'experience.created', 'experience', _row.id, _key,
    jsonb_build_object('kind', _row.experience_kind, 'status', _row.status)
  );

  _existing := jsonb_build_object('experience_id', _row.id, 'tenant_id', _tenant_id, 'slug', _row.slug);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_tenant_id, _uid, 'experience.create', _key, _existing);
  return _existing;
end;
$$;

-- ---- create_offering ----
create or replace function public.create_offering(
  _tenant_id uuid,
  _experience_id uuid,
  _name text,
  _slug text,
  _idempotency_key text,
  _available_from timestamptz default null,
  _available_until timestamptz default null,
  _sales_start timestamptz default null,
  _sales_end timestamptz default null,
  _capacity integer default null,
  _currency_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _existing jsonb;
  _row public.offerings;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins can create formats';
  end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = _uid and k.action = 'offering.create' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  if not exists (select 1 from public.experiences e
                 where e.id = _experience_id and e.tenant_id = _tenant_id) then
    raise exception 'Experience not found in this organization';
  end if;

  insert into public.offerings (
    tenant_id, experience_id, name, slug, available_from, available_until,
    sales_start, sales_end, capacity, currency_code, created_by
  ) values (
    _tenant_id, _experience_id, btrim(_name), lower(btrim(_slug)),
    _available_from, _available_until, _sales_start, _sales_end, _capacity,
    nullif(upper(btrim(coalesce(_currency_code,''))),''), _uid
  ) returning * into _row;

  perform app_private.record_audit_event(
    _tenant_id, _uid, 'offering.created', 'offering', _row.id, _key,
    jsonb_build_object('experience_id', _experience_id, 'status', _row.status)
  );

  _existing := jsonb_build_object('offering_id', _row.id, 'tenant_id', _tenant_id,
                                  'experience_id', _experience_id, 'slug', _row.slug);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_tenant_id, _uid, 'offering.create', _key, _existing);
  return _existing;
end;
$$;

-- ---- create_operation ----
create or replace function public.create_operation(
  _tenant_id uuid,
  _name text,
  _code text,
  _operation_kind public.experience_kind,
  _primary_country text,
  _timezone text,
  _planned_start timestamptz,
  _planned_end timestamptz,
  _idempotency_key text,
  _experience_id uuid default null,
  _offering_id uuid default null,
  _primary_region text default null,
  _primary_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _existing jsonb;
  _row public.operations;
  _experience public.experiences;
  _offering public.offerings;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to create operations';
  end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = _uid and k.action = 'operation.create' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  if _offering_id is not null then
    select * into _offering from public.offerings o
      where o.id = _offering_id and o.tenant_id = _tenant_id;
    if _offering.id is null then
      raise exception 'Format not found in this organization';
    end if;
    if _experience_id is null then
      _experience_id := _offering.experience_id;
    elsif _experience_id <> _offering.experience_id then
      raise exception 'The selected format does not belong to the selected experience';
    end if;
  end if;

  if _experience_id is not null then
    select * into _experience from public.experiences e
      where e.id = _experience_id and e.tenant_id = _tenant_id;
    if _experience.id is null then
      raise exception 'Experience not found in this organization';
    end if;
  end if;

  insert into public.operations (
    tenant_id, experience_id, offering_id, name, code, operation_kind,
    primary_country, primary_region, primary_city, timezone,
    planned_start, planned_end, source_experience_name, source_offering_name, created_by
  ) values (
    _tenant_id, _experience_id, _offering_id, btrim(_name), btrim(_code), _operation_kind,
    upper(btrim(_primary_country)), nullif(btrim(coalesce(_primary_region,'')),''),
    nullif(btrim(coalesce(_primary_city,'')),''), btrim(_timezone),
    _planned_start, _planned_end, _experience.name, _offering.name, _uid
  ) returning * into _row;

  perform app_private.record_audit_event(
    _tenant_id, _uid, 'operation.created', 'operation', _row.id, _key,
    jsonb_build_object(
      'kind', _row.operation_kind, 'status', _row.status,
      'experience_id', _experience_id, 'offering_id', _offering_id,
      'standalone', (_experience_id is null)
    )
  );

  _existing := jsonb_build_object('operation_id', _row.id, 'tenant_id', _tenant_id, 'code', _row.code);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_tenant_id, _uid, 'operation.create', _key, _existing);
  return _existing;
end;
$$;

-- ---- set_operation_status ----
create or replace function public.set_operation_status(
  _operation_id uuid,
  _status public.operation_status,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _op public.operations;
  _allowed boolean := false;
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _op from public.operations o where o.id = _operation_id for update;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this operation';
  end if;
  if _op.status = _status then
    return jsonb_build_object('operation_id', _op.id, 'status', _op.status, 'unchanged', true);
  end if;

  -- terminal states are final
  if _op.status in ('completed', 'cancelled') then
    raise exception 'A % operation cannot change status', _op.status;
  end if;

  _allowed := case _op.status
    when 'draft'    then _status in ('planning', 'cancelled')
    when 'planning' then _status in ('draft', 'ready', 'cancelled')
    when 'ready'    then _status in ('planning', 'active', 'cancelled')
    when 'active'   then _status in ('completed', 'cancelled')
    else false
  end;
  if not _allowed then
    raise exception 'Transition from % to % is not allowed', _op.status, _status;
  end if;
  if _status = 'completed' and not app_private.has_tenant_role(_op.tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins can complete an operation';
  end if;
  if _status = 'cancelled' and _reason_clean is null then
    raise exception 'A reason is required to cancel an operation';
  end if;

  perform set_config('app.op_control', 'on', true);
  update public.operations set
    status = _status,
    completed_at = case when _status = 'completed' then now() else completed_at end,
    cancelled_at = case when _status = 'cancelled' then now() else cancelled_at end,
    cancellation_reason = case when _status = 'cancelled' then _reason_clean else cancellation_reason end
  where id = _op.id;
  perform set_config('app.op_control', 'off', true);

  perform app_private.record_audit_event(
    _op.tenant_id, _uid,
    case _status when 'completed' then 'operation.completed'
                 when 'cancelled' then 'operation.cancelled'
                 else 'operation.status_changed' end,
    'operation', _op.id, null,
    jsonb_build_object('from_status', _op.status, 'to_status', _status, 'reason', _reason_clean)
  );

  return jsonb_build_object('operation_id', _op.id, 'status', _status);
end;
$$;

-- ---- set_operation_planned_window (baseline, editable only in draft/planning) ----
create or replace function public.set_operation_planned_window(
  _operation_id uuid,
  _planned_start timestamptz,
  _planned_end timestamptz,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _op public.operations;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _op from public.operations o where o.id = _operation_id for update;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this operation';
  end if;
  if _op.status not in ('draft', 'planning') then
    raise exception 'The planned window is the baseline and is frozen from "ready" onward. Use the expected window instead.';
  end if;
  if _planned_start is null or _planned_end is null or _planned_end < _planned_start then
    raise exception 'Invalid planned window';
  end if;

  perform set_config('app.op_control', 'on', true);
  update public.operations
    set planned_start = _planned_start, planned_end = _planned_end
    where id = _op.id;
  perform set_config('app.op_control', 'off', true);

  perform app_private.record_audit_event(
    _op.tenant_id, _uid, 'operation.planned_time_changed', 'operation', _op.id, null,
    jsonb_build_object(
      'previous_planned_start', _op.planned_start, 'previous_planned_end', _op.planned_end,
      'new_planned_start', _planned_start, 'new_planned_end', _planned_end,
      'reason', nullif(btrim(coalesce(_reason, '')), ''), 'status', _op.status
    )
  );

  return jsonb_build_object('operation_id', _op.id, 'planned_start', _planned_start, 'planned_end', _planned_end);
end;
$$;

-- ---- set_operation_expected_window (forecast, reason required) ----
create or replace function public.set_operation_expected_window(
  _operation_id uuid,
  _expected_start timestamptz,
  _expected_end timestamptz,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _op public.operations;
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _op from public.operations o where o.id = _operation_id for update;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this operation';
  end if;
  if _reason_clean is null then
    raise exception 'A reason is required to change the forecast';
  end if;
  if _expected_start is not null and _expected_end is not null and _expected_end < _expected_start then
    raise exception 'Invalid expected window';
  end if;
  if _op.status in ('completed', 'cancelled') then
    raise exception 'A % operation no longer has a forecast', _op.status;
  end if;

  perform set_config('app.op_control', 'on', true);
  update public.operations
    set expected_start = _expected_start, expected_end = _expected_end
    where id = _op.id;
  perform set_config('app.op_control', 'off', true);

  perform app_private.record_audit_event(
    _op.tenant_id, _uid, 'operation.expected_time_changed', 'operation', _op.id, null,
    jsonb_build_object(
      'previous_expected_start', _op.expected_start, 'previous_expected_end', _op.expected_end,
      'new_expected_start', _expected_start, 'new_expected_end', _expected_end,
      'reason', _reason_clean
    )
  );

  return jsonb_build_object('operation_id', _op.id,
                            'expected_start', _expected_start, 'expected_end', _expected_end);
end;
$$;

-- ---- set_operation_archived (orthogonal to outcome) ----
create or replace function public.set_operation_archived(
  _operation_id uuid,
  _archived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _op public.operations;
  _new timestamptz;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _op from public.operations o where o.id = _operation_id for update;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins can archive operations';
  end if;

  _new := case when _archived then now() else null end;

  perform set_config('app.op_control', 'on', true);
  update public.operations set archived_at = _new where id = _op.id;
  perform set_config('app.op_control', 'off', true);

  perform app_private.record_audit_event(
    _op.tenant_id, _uid,
    case when _archived then 'operation.archived' else 'operation.unarchived' end,
    'operation', _op.id, null,
    jsonb_build_object('status', _op.status)  -- outcome is preserved, never overwritten
  );

  return jsonb_build_object('operation_id', _op.id, 'archived_at', _new, 'status', _op.status);
end;
$$;

-- --------------------------- execute grants --------------------------
revoke all on function public.create_experience(uuid, text, text, public.experience_kind, text, text, text, text, text, text, text, text, text[]) from public, anon;
revoke all on function public.create_offering(uuid, uuid, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, integer, text) from public, anon;
revoke all on function public.create_operation(uuid, text, text, public.experience_kind, text, text, timestamptz, timestamptz, text, uuid, uuid, text, text) from public, anon;
revoke all on function public.set_operation_status(uuid, public.operation_status, text) from public, anon;
revoke all on function public.set_operation_planned_window(uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.set_operation_expected_window(uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.set_operation_archived(uuid, boolean) from public, anon;

grant execute on function public.create_experience(uuid, text, text, public.experience_kind, text, text, text, text, text, text, text, text, text[]) to authenticated;
grant execute on function public.create_offering(uuid, uuid, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, integer, text) to authenticated;
grant execute on function public.create_operation(uuid, text, text, public.experience_kind, text, text, timestamptz, timestamptz, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.set_operation_status(uuid, public.operation_status, text) to authenticated;
grant execute on function public.set_operation_planned_window(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.set_operation_expected_window(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.set_operation_archived(uuid, boolean) to authenticated;