-- =========================================================
-- Journey Blueprint backend MVP (POST_PILOT_RELEASE_04)
-- Functional + structural. No DML on operational data.
-- =========================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'journey_blueprint_status') then
    create type public.journey_blueprint_status as enum ('active','archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'journey_blueprint_version_status') then
    create type public.journey_blueprint_version_status as enum ('draft','published','archived');
  end if;
end $$;

-- ---------- tables ----------
create table public.journey_blueprints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null,
  slug text not null,
  description text,
  status public.journey_blueprint_status not null default 'active',
  default_timezone text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_blueprints_slug_unique unique (tenant_id, slug),
  constraint journey_blueprints_name_not_blank check (btrim(name) <> ''),
  constraint journey_blueprints_slug_not_blank check (btrim(slug) <> '')
);

create table public.journey_blueprint_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  blueprint_id uuid not null references public.journey_blueprints(id) on delete restrict,
  version_number integer not null,
  status public.journey_blueprint_version_status not null default 'draft',
  notes text,
  published_at timestamptz,
  published_by uuid,
  step_count integer not null default 0,
  checksum text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_blueprint_versions_number_unique unique (blueprint_id, version_number),
  constraint journey_blueprint_versions_number_positive check (version_number > 0)
);

create unique index journey_blueprint_versions_single_draft
  on public.journey_blueprint_versions (blueprint_id)
  where status = 'draft';

create table public.journey_blueprint_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  version_id uuid not null references public.journey_blueprint_versions(id) on delete cascade,
  sequence integer not null,
  title text not null,
  description text,
  step_kind public.journey_step_kind not null,
  start_offset_minutes integer not null,
  duration_minutes integer,
  location_label text,
  traveler_label text,
  traveler_facing boolean not null default false,
  presence_requirement public.step_presence_requirement,
  presence_population public.step_presence_population not null default 'participants',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_blueprint_steps_sequence_unique unique (version_id, sequence),
  constraint journey_blueprint_steps_sequence_positive check (sequence > 0),
  constraint journey_blueprint_steps_offset_non_negative check (start_offset_minutes >= 0),
  constraint journey_blueprint_steps_duration_positive check (duration_minutes is null or duration_minutes > 0),
  constraint journey_blueprint_steps_title_not_blank check (btrim(title) <> '')
);

create table public.operation_journey_provisionings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  operation_id uuid not null references public.operations(id) on delete restrict,
  blueprint_id uuid not null references public.journey_blueprints(id) on delete restrict,
  blueprint_version_id uuid not null references public.journey_blueprint_versions(id) on delete restrict,
  version_checksum text not null,
  applied_by uuid not null,
  applied_at timestamptz not null default now(),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint operation_journey_provisionings_operation_unique unique (operation_id),
  constraint operation_journey_provisionings_key_unique unique (tenant_id, idempotency_key)
);

create index journey_blueprint_versions_blueprint_idx on public.journey_blueprint_versions (blueprint_id);
create index journey_blueprint_steps_version_idx on public.journey_blueprint_steps (version_id, sequence);
create index operation_journey_provisionings_version_idx on public.operation_journey_provisionings (blueprint_version_id);

-- ---------- traceability on journey_steps ----------
alter table public.journey_steps
  add column source_blueprint_version_id uuid references public.journey_blueprint_versions(id) on delete set null,
  add column source_blueprint_step_id uuid references public.journey_blueprint_steps(id) on delete set null;

-- ---------- grants ----------
grant select on public.journey_blueprints to authenticated;
grant select on public.journey_blueprint_versions to authenticated;
grant select on public.journey_blueprint_steps to authenticated;
grant select on public.operation_journey_provisionings to authenticated;
grant all on public.journey_blueprints to service_role;
grant all on public.journey_blueprint_versions to service_role;
grant all on public.journey_blueprint_steps to service_role;
grant all on public.operation_journey_provisionings to service_role;

-- ---------- RLS ----------
alter table public.journey_blueprints enable row level security;
alter table public.journey_blueprint_versions enable row level security;
alter table public.journey_blueprint_steps enable row level security;
alter table public.operation_journey_provisionings enable row level security;

create policy "Members read blueprints" on public.journey_blueprints
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent','member']::public.app_role[]));

create policy "Members read blueprint versions" on public.journey_blueprint_versions
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent','member']::public.app_role[]));

create policy "Members read blueprint steps" on public.journey_blueprint_steps
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent','member']::public.app_role[]));

create policy "Members read journey provisionings" on public.operation_journey_provisionings
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent','member']::public.app_role[]));

-- ---------- immutability guards ----------
create or replace function app_private.blueprint_control_active()
returns boolean language sql stable set search_path to 'pg_catalog','public' as $$
  select coalesce(current_setting('app.blueprint_control', true), 'off') = 'on'
$$;

create or replace function public.guard_blueprint_mutation()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  if not app_private.blueprint_control_active() then
    raise exception 'Journey blueprints can only change through the approved commands';
  end if;
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'A journey blueprint record cannot change organisation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_blueprint_version_immutability()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'A published blueprint version can never be deleted';
    end if;
    return old;
  end if;
  if old.status = 'published' then
    raise exception 'Blueprint version % is published and is therefore immutable', old.version_number;
  end if;
  if old.status = 'archived' and new.status is distinct from old.status then
    raise exception 'An archived blueprint version cannot change status';
  end if;
  if new.blueprint_id is distinct from old.blueprint_id
     or new.version_number is distinct from old.version_number then
    raise exception 'A blueprint version cannot be renumbered or moved';
  end if;
  return new;
end;
$$;

create or replace function public.guard_blueprint_step_immutability()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
declare _status public.journey_blueprint_version_status;
begin
  select v.status into _status from public.journey_blueprint_versions v
    where v.id = coalesce(new.version_id, old.version_id);
  if _status is not null and _status <> 'draft' then
    raise exception 'Blueprint steps can only change while the version is a draft';
  end if;
  if tg_op = 'UPDATE' and new.version_id is distinct from old.version_id then
    raise exception 'A blueprint step cannot move between versions';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_blueprint_provisioning_append_only()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  raise exception 'A journey provisioning record is permanent and cannot be changed or removed';
end;
$$;

create or replace function public.guard_blueprint_no_delete()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  raise exception 'Journey blueprints are archived, never deleted';
end;
$$;

create trigger journey_blueprints_guard before insert or update or delete on public.journey_blueprints
  for each row execute function public.guard_blueprint_mutation();
create trigger journey_blueprints_no_delete before delete on public.journey_blueprints
  for each row execute function public.guard_blueprint_no_delete();
create trigger journey_blueprints_updated_at before update on public.journey_blueprints
  for each row execute function public.set_updated_at();

create trigger journey_blueprint_versions_guard before insert or update or delete on public.journey_blueprint_versions
  for each row execute function public.guard_blueprint_mutation();
create trigger journey_blueprint_versions_immutability before update or delete on public.journey_blueprint_versions
  for each row execute function public.guard_blueprint_version_immutability();
create trigger journey_blueprint_versions_updated_at before update on public.journey_blueprint_versions
  for each row execute function public.set_updated_at();

create trigger journey_blueprint_steps_guard before insert or update or delete on public.journey_blueprint_steps
  for each row execute function public.guard_blueprint_mutation();
create trigger journey_blueprint_steps_immutability before insert or update or delete on public.journey_blueprint_steps
  for each row execute function public.guard_blueprint_step_immutability();
create trigger journey_blueprint_steps_updated_at before update on public.journey_blueprint_steps
  for each row execute function public.set_updated_at();

create trigger operation_journey_provisionings_guard before insert on public.operation_journey_provisionings
  for each row execute function public.guard_blueprint_mutation();
create trigger operation_journey_provisionings_append_only before update or delete on public.operation_journey_provisionings
  for each row execute function public.guard_blueprint_provisioning_append_only();

-- ---------- helpers ----------
create or replace function app_private.blueprint_require_role(_tenant_id uuid, _roles text[])
returns void language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id, _roles::public.app_role[]) then
    raise exception 'You do not have permission to manage journey blueprints';
  end if;
end;
$$;

create or replace function app_private.blueprint_checksum(_version_id uuid)
returns text language sql stable security definer set search_path to 'pg_catalog','public' as $$
  select md5(coalesce(string_agg(
    concat_ws('|', s.sequence::text, btrim(s.title), s.step_kind::text,
      s.start_offset_minutes::text, coalesce(s.duration_minutes::text,'-'),
      coalesce(btrim(s.description),''), coalesce(btrim(s.location_label),''),
      coalesce(btrim(s.traveler_label),''), s.traveler_facing::text,
      coalesce(s.presence_requirement::text,'default'), s.presence_population::text),
    E'\n' order by s.sequence), ''))
  from public.journey_blueprint_steps s where s.version_id = _version_id
$$;

create or replace function app_private.blueprint_version_ctx(_version_id uuid, _roles text[])
returns public.journey_blueprint_versions
language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare _v public.journey_blueprint_versions;
begin
  select * into _v from public.journey_blueprint_versions v where v.id = _version_id;
  if _v.id is null then raise exception 'Blueprint version not found'; end if;
  perform app_private.blueprint_require_role(_v.tenant_id, _roles);
  return _v;
end;
$$;

-- ---------- validation (read-only) ----------
create or replace function public.validate_blueprint_version(_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare
  _v public.journey_blueprint_versions;
  _b public.journey_blueprints;
  _violations jsonb := '[]'::jsonb;
  _s record; _prev_offset int := null; _req public.step_presence_requirement; _count int;
begin
  _v := app_private.blueprint_version_ctx(_version_id, array['owner','admin','operations_agent','member']);
  select * into _b from public.journey_blueprints b where b.id = _v.blueprint_id;

  if _b.status <> 'active' then
    _violations := _violations || jsonb_build_object('code','blueprint_archived','message','The blueprint is archived');
  end if;
  if _b.tenant_id <> _v.tenant_id then
    _violations := _violations || jsonb_build_object('code','tenant_mismatch','message','Version and blueprint belong to different organisations');
  end if;

  select count(*) into _count from public.journey_blueprint_steps s where s.version_id = _v.id;
  if _count = 0 then
    _violations := _violations || jsonb_build_object('code','no_steps','message','A version needs at least one step');
  end if;

  for _s in
    select * from public.journey_blueprint_steps s where s.version_id = _v.id order by s.sequence
  loop
    if _s.tenant_id <> _v.tenant_id then
      _violations := _violations || jsonb_build_object('code','tenant_mismatch','sequence',_s.sequence,'message','Step belongs to another organisation');
    end if;
    if btrim(coalesce(_s.title,'')) = '' then
      _violations := _violations || jsonb_build_object('code','empty_title','sequence',_s.sequence,'message','Step title is empty');
    end if;
    if _s.sequence <= 0 then
      _violations := _violations || jsonb_build_object('code','invalid_sequence','sequence',_s.sequence,'message','Sequence must be positive');
    end if;
    if _s.start_offset_minutes < 0 then
      _violations := _violations || jsonb_build_object('code','invalid_offset','sequence',_s.sequence,'message','Offset cannot be negative');
    end if;
    if _prev_offset is not null and _s.start_offset_minutes < _prev_offset then
      _violations := _violations || jsonb_build_object('code','offset_not_monotonic','sequence',_s.sequence,'message','Offsets must not decrease along the sequence');
    end if;
    _prev_offset := _s.start_offset_minutes;
    if _s.duration_minutes is not null and _s.duration_minutes <= 0 then
      _violations := _violations || jsonb_build_object('code','invalid_duration','sequence',_s.sequence,'message','Duration must be positive');
    end if;
    _req := coalesce(_s.presence_requirement, app_private.w04_default_presence_requirement(_s.step_kind));
    begin
      perform app_private.w04_assert_presence_contract(_s.step_kind, _req, _s.presence_population);
    exception when others then
      _violations := _violations || jsonb_build_object('code','presence_contract','sequence',_s.sequence,'message',sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'version_id', _v.id,
    'status', _v.status,
    'step_count', _count,
    'valid', jsonb_array_length(_violations) = 0,
    'violations', _violations);
end;
$$;

-- ---------- RPCs ----------
create or replace function public.create_journey_blueprint(
  _tenant_id uuid, _name text, _slug text, _idempotency_key text,
  _description text default null, _default_timezone text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _b public.journey_blueprints; _v public.journey_blueprint_versions;
begin
  perform app_private.blueprint_require_role(_tenant_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if btrim(coalesce(_name,'')) = '' then raise exception 'Blueprint name is required'; end if;
  if btrim(coalesce(_slug,'')) = '' then raise exception 'Blueprint slug is required'; end if;

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'blueprint.create' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  if exists (select 1 from public.journey_blueprints b where b.tenant_id = _tenant_id and b.slug = btrim(_slug)) then
    raise exception 'A blueprint with slug "%" already exists in this organisation', btrim(_slug);
  end if;

  perform set_config('app.blueprint_control','on', true);
  insert into public.journey_blueprints (tenant_id, name, slug, description, default_timezone, created_by)
  values (_tenant_id, btrim(_name), btrim(_slug), nullif(btrim(coalesce(_description,'')),''),
          nullif(btrim(coalesce(_default_timezone,'')),''), auth.uid())
  returning * into _b;

  insert into public.journey_blueprint_versions (tenant_id, blueprint_id, version_number, created_by)
  values (_tenant_id, _b.id, 1, auth.uid())
  returning * into _v;
  perform set_config('app.blueprint_control','off', true);

  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'journey_blueprint.created',
    'journey_blueprint', _b.id, _key, jsonb_build_object('slug', _b.slug, 'version_id', _v.id));

  _existing := jsonb_build_object('blueprint_id', _b.id, 'version_id', _v.id, 'version_number', 1);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_tenant_id, auth.uid(), 'blueprint.create', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.create_blueprint_version(
  _blueprint_id uuid, _from_version_id uuid, _idempotency_key text, _notes text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _b public.journey_blueprints; _src public.journey_blueprint_versions; _v public.journey_blueprint_versions; _next int;
begin
  select * into _b from public.journey_blueprints b where b.id = _blueprint_id;
  if _b.id is null then raise exception 'Blueprint not found'; end if;
  perform app_private.blueprint_require_role(_b.tenant_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'blueprint.version_create' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  if _b.status <> 'active' then raise exception 'An archived blueprint cannot receive new versions'; end if;
  if exists (select 1 from public.journey_blueprint_versions v where v.blueprint_id = _b.id and v.status = 'draft') then
    raise exception 'This blueprint already has an open draft version';
  end if;

  select * into _src from public.journey_blueprint_versions v where v.id = _from_version_id;
  if _src.id is null or _src.blueprint_id <> _b.id then
    raise exception 'The source version must belong to this blueprint';
  end if;
  if _src.status <> 'published' then raise exception 'A new version can only be created from a published version'; end if;

  select coalesce(max(v.version_number),0) + 1 into _next
    from public.journey_blueprint_versions v where v.blueprint_id = _b.id;

  perform set_config('app.blueprint_control','on', true);
  insert into public.journey_blueprint_versions (tenant_id, blueprint_id, version_number, notes, created_by)
  values (_b.tenant_id, _b.id, _next, nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _v;

  insert into public.journey_blueprint_steps (tenant_id, version_id, sequence, title, description, step_kind,
    start_offset_minutes, duration_minutes, location_label, traveler_label, traveler_facing,
    presence_requirement, presence_population, metadata)
  select _b.tenant_id, _v.id, s.sequence, s.title, s.description, s.step_kind,
    s.start_offset_minutes, s.duration_minutes, s.location_label, s.traveler_label, s.traveler_facing,
    s.presence_requirement, s.presence_population, s.metadata
  from public.journey_blueprint_steps s where s.version_id = _src.id;

  update public.journey_blueprint_versions set step_count = (
    select count(*) from public.journey_blueprint_steps s where s.version_id = _v.id
  ) where id = _v.id;
  perform set_config('app.blueprint_control','off', true);

  perform app_private.record_audit_event(_b.tenant_id, auth.uid(), 'journey_blueprint_version.created',
    'journey_blueprint_version', _v.id, _key,
    jsonb_build_object('blueprint_id', _b.id, 'version_number', _next, 'cloned_from', _src.id));

  _existing := jsonb_build_object('version_id', _v.id, 'version_number', _next);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_b.tenant_id, auth.uid(), 'blueprint.version_create', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.add_blueprint_step(
  _version_id uuid, _title text, _step_kind journey_step_kind, _start_offset_minutes integer,
  _idempotency_key text, _sequence integer default null, _description text default null,
  _duration_minutes integer default null, _location_label text default null, _traveler_label text default null,
  _traveler_facing boolean default false, _presence_requirement step_presence_requirement default null,
  _presence_population step_presence_population default 'participants')
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _v public.journey_blueprint_versions; _row public.journey_blueprint_steps; _seq int;
  _req public.step_presence_requirement; _pop public.step_presence_population;
begin
  _v := app_private.blueprint_version_ctx(_version_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'blueprint.step_add' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  if _v.status <> 'draft' then raise exception 'Only a draft version can receive steps'; end if;
  if btrim(coalesce(_title,'')) = '' then raise exception 'Step title is required'; end if;
  if coalesce(_start_offset_minutes,-1) < 0 then raise exception 'Start offset must be zero or greater'; end if;
  if _duration_minutes is not null and _duration_minutes <= 0 then raise exception 'Duration must be positive'; end if;

  _pop := coalesce(_presence_population, 'participants');
  _req := coalesce(_presence_requirement, app_private.w04_default_presence_requirement(_step_kind));
  perform app_private.w04_assert_presence_contract(_step_kind, _req, _pop);

  _seq := coalesce(_sequence, (select coalesce(max(s.sequence),0) + 10
    from public.journey_blueprint_steps s where s.version_id = _v.id));
  if _seq <= 0 then raise exception 'Sequence must be positive'; end if;
  if exists (select 1 from public.journey_blueprint_steps s where s.version_id = _v.id and s.sequence = _seq) then
    raise exception 'Sequence % is already used in this version', _seq;
  end if;

  perform set_config('app.blueprint_control','on', true);
  insert into public.journey_blueprint_steps (tenant_id, version_id, sequence, title, description, step_kind,
    start_offset_minutes, duration_minutes, location_label, traveler_label, traveler_facing,
    presence_requirement, presence_population)
  values (_v.tenant_id, _v.id, _seq, btrim(_title), nullif(btrim(coalesce(_description,'')),''), _step_kind,
    _start_offset_minutes, _duration_minutes, nullif(btrim(coalesce(_location_label,'')),''),
    nullif(btrim(coalesce(_traveler_label,'')),''), coalesce(_traveler_facing,false),
    _presence_requirement, _pop)
  returning * into _row;
  update public.journey_blueprint_versions set step_count = (
    select count(*) from public.journey_blueprint_steps s where s.version_id = _v.id) where id = _v.id;
  perform set_config('app.blueprint_control','off', true);

  perform app_private.record_audit_event(_v.tenant_id, auth.uid(), 'journey_blueprint_step.added',
    'journey_blueprint_step', _row.id, _key,
    jsonb_build_object('version_id', _v.id, 'sequence', _seq, 'kind', _step_kind));

  _existing := jsonb_build_object('blueprint_step_id', _row.id, 'sequence', _seq);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_v.tenant_id, auth.uid(), 'blueprint.step_add', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.update_blueprint_step(
  _step_id uuid, _idempotency_key text, _title text default null, _step_kind journey_step_kind default null,
  _start_offset_minutes integer default null, _duration_minutes integer default null,
  _clear_duration boolean default false, _description text default null, _location_label text default null,
  _traveler_label text default null, _traveler_facing boolean default null,
  _presence_requirement step_presence_requirement default null, _clear_presence_requirement boolean default false,
  _presence_population step_presence_population default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _row public.journey_blueprint_steps; _v public.journey_blueprint_versions;
  _kind public.journey_step_kind; _req public.step_presence_requirement; _pop public.step_presence_population;
  _stored public.step_presence_requirement; _offset int; _dur int;
begin
  select * into _row from public.journey_blueprint_steps s where s.id = _step_id;
  if _row.id is null then raise exception 'Blueprint step not found'; end if;
  _v := app_private.blueprint_version_ctx(_row.version_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'blueprint.step_update' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;
  if _v.status <> 'draft' then raise exception 'Only steps of a draft version can be changed'; end if;

  _kind := coalesce(_step_kind, _row.step_kind);
  _stored := case when _clear_presence_requirement then null
                  else coalesce(_presence_requirement, _row.presence_requirement) end;
  _pop := coalesce(_presence_population, _row.presence_population);
  _req := coalesce(_stored, app_private.w04_default_presence_requirement(_kind));
  perform app_private.w04_assert_presence_contract(_kind, _req, _pop);

  _offset := coalesce(_start_offset_minutes, _row.start_offset_minutes);
  if _offset < 0 then raise exception 'Start offset must be zero or greater'; end if;
  _dur := case when _clear_duration then null else coalesce(_duration_minutes, _row.duration_minutes) end;
  if _dur is not null and _dur <= 0 then raise exception 'Duration must be positive'; end if;
  if _title is not null and btrim(_title) = '' then raise exception 'Step title cannot be empty'; end if;

  perform set_config('app.blueprint_control','on', true);
  update public.journey_blueprint_steps s set
    title = coalesce(nullif(btrim(coalesce(_title,'')),''), s.title),
    step_kind = _kind,
    start_offset_minutes = _offset,
    duration_minutes = _dur,
    description = case when _description is null then s.description else nullif(btrim(_description),'') end,
    location_label = case when _location_label is null then s.location_label else nullif(btrim(_location_label),'') end,
    traveler_label = case when _traveler_label is null then s.traveler_label else nullif(btrim(_traveler_label),'') end,
    traveler_facing = coalesce(_traveler_facing, s.traveler_facing),
    presence_requirement = _stored,
    presence_population = _pop
  where s.id = _row.id
  returning * into _row;
  perform set_config('app.blueprint_control','off', true);

  perform app_private.record_audit_event(_v.tenant_id, auth.uid(), 'journey_blueprint_step.updated',
    'journey_blueprint_step', _row.id, _key,
    jsonb_build_object('version_id', _v.id, 'sequence', _row.sequence, 'kind', _kind));

  _existing := jsonb_build_object('blueprint_step_id', _row.id, 'sequence', _row.sequence);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_v.tenant_id, auth.uid(), 'blueprint.step_update', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.remove_blueprint_step(_step_id uuid, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _row public.journey_blueprint_steps; _v public.journey_blueprint_versions;
begin
  select * into _row from public.journey_blueprint_steps s where s.id = _step_id;
  if _row.id is null then raise exception 'Blueprint step not found'; end if;
  _v := app_private.blueprint_version_ctx(_row.version_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'blueprint.step_remove' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;
  if _v.status <> 'draft' then raise exception 'Only steps of a draft version can be removed'; end if;

  perform set_config('app.blueprint_control','on', true);
  delete from public.journey_blueprint_steps s where s.id = _row.id;
  update public.journey_blueprint_versions set step_count = (
    select count(*) from public.journey_blueprint_steps s where s.version_id = _v.id) where id = _v.id;
  perform set_config('app.blueprint_control','off', true);

  perform app_private.record_audit_event(_v.tenant_id, auth.uid(), 'journey_blueprint_step.removed',
    'journey_blueprint_step', _row.id, _key,
    jsonb_build_object('version_id', _v.id, 'sequence', _row.sequence));

  _existing := jsonb_build_object('blueprint_step_id', _row.id, 'removed', true);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_v.tenant_id, auth.uid(), 'blueprint.step_remove', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.reorder_blueprint_steps(
  _version_id uuid, _ordered_step_ids uuid[], _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _v public.journey_blueprint_versions; _total int; _given int; _i int;
begin
  _v := app_private.blueprint_version_ctx(_version_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'blueprint.step_reorder' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;
  if _v.status <> 'draft' then raise exception 'Only a draft version can be reordered'; end if;

  select count(*) into _total from public.journey_blueprint_steps s where s.version_id = _v.id;
  select count(distinct x) into _given from unnest(coalesce(_ordered_step_ids, '{}'::uuid[])) x;
  if _given <> coalesce(array_length(_ordered_step_ids,1),0) then
    raise exception 'The ordered list cannot repeat a step';
  end if;
  if _given <> _total then
    raise exception 'The ordered list must contain every step of this version exactly once';
  end if;
  if exists (
    select 1 from unnest(_ordered_step_ids) x
    where not exists (select 1 from public.journey_blueprint_steps s where s.id = x and s.version_id = _v.id)
  ) then
    raise exception 'The ordered list references a step from another version';
  end if;

  perform set_config('app.blueprint_control','on', true);
  update public.journey_blueprint_steps s set sequence = -s.sequence where s.version_id = _v.id;
  _i := 0;
  for _i in 1 .. array_length(_ordered_step_ids,1) loop
    update public.journey_blueprint_steps s set sequence = _i * 10 where s.id = _ordered_step_ids[_i];
  end loop;
  perform set_config('app.blueprint_control','off', true);

  perform app_private.record_audit_event(_v.tenant_id, auth.uid(), 'journey_blueprint_step.reordered',
    'journey_blueprint_version', _v.id, _key, jsonb_build_object('step_count', _total));

  _existing := jsonb_build_object('version_id', _v.id, 'step_count', _total);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_v.tenant_id, auth.uid(), 'blueprint.step_reorder', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.publish_blueprint_version(_version_id uuid, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _v public.journey_blueprint_versions; _report jsonb; _checksum text; _count int;
begin
  _v := app_private.blueprint_version_ctx(_version_id, array['owner','admin']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'blueprint.version_publish' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;
  if _v.status <> 'draft' then raise exception 'Only a draft version can be published'; end if;

  _report := public.validate_blueprint_version(_v.id);
  if not (_report->>'valid')::boolean then
    raise exception 'This version cannot be published: %', _report->'violations';
  end if;

  _checksum := app_private.blueprint_checksum(_v.id);
  select count(*) into _count from public.journey_blueprint_steps s where s.version_id = _v.id;

  perform set_config('app.blueprint_control','on', true);
  update public.journey_blueprint_versions v set status = 'published', published_at = now(),
    published_by = auth.uid(), checksum = _checksum, step_count = _count
  where v.id = _v.id;
  perform set_config('app.blueprint_control','off', true);

  perform app_private.record_audit_event(_v.tenant_id, auth.uid(), 'journey_blueprint_version.published',
    'journey_blueprint_version', _v.id, _key,
    jsonb_build_object('blueprint_id', _v.blueprint_id, 'version_number', _v.version_number,
      'checksum', _checksum, 'step_count', _count));

  _existing := jsonb_build_object('version_id', _v.id, 'version_number', _v.version_number,
    'checksum', _checksum, 'step_count', _count);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_v.tenant_id, auth.uid(), 'blueprint.version_publish', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.archive_journey_blueprint(
  _blueprint_id uuid, _reason text, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _b public.journey_blueprints; _r text := nullif(btrim(coalesce(_reason,'')),'');
begin
  select * into _b from public.journey_blueprints b where b.id = _blueprint_id;
  if _b.id is null then raise exception 'Blueprint not found'; end if;
  perform app_private.blueprint_require_role(_b.tenant_id, array['owner','admin']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _r is null then raise exception 'An archive reason is required'; end if;
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'blueprint.archive' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;
  if _b.status <> 'active' then raise exception 'This blueprint is already archived'; end if;

  perform set_config('app.blueprint_control','on', true);
  update public.journey_blueprints b set status = 'archived',
    metadata = b.metadata || jsonb_build_object('archive_reason', _r) where b.id = _b.id;
  perform set_config('app.blueprint_control','off', true);

  perform app_private.record_audit_event(_b.tenant_id, auth.uid(), 'journey_blueprint.archived',
    'journey_blueprint', _b.id, _key, jsonb_build_object('reason', _r));

  _existing := jsonb_build_object('blueprint_id', _b.id, 'status', 'archived');
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_b.tenant_id, auth.uid(), 'blueprint.archive', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.apply_journey_blueprint_to_operation(
  _operation_id uuid, _version_id uuid, _idempotency_key text,
  _anchor_start timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _op public.operations; _v public.journey_blueprint_versions; _b public.journey_blueprints;
  _anchor timestamptz; _s record; _req public.step_presence_requirement;
  _steps jsonb := '[]'::jsonb; _new public.journey_steps; _report jsonb; _count int;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'journey.blueprint_apply' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  select * into _v from public.journey_blueprint_versions v where v.id = _version_id;
  if _v.id is null then raise exception 'Blueprint version not found'; end if;
  select * into _b from public.journey_blueprints b where b.id = _v.blueprint_id;
  if _v.tenant_id <> _op.tenant_id or _b.tenant_id <> _op.tenant_id then
    raise exception 'The blueprint belongs to another organisation';
  end if;
  if _b.status <> 'active' then raise exception 'An archived blueprint cannot be applied'; end if;
  if _v.status <> 'published' then raise exception 'Only a published version can be applied'; end if;
  if _op.status not in ('draft','planning') then
    raise exception 'A blueprint can only be applied while the operation is still being planned';
  end if;
  if exists (select 1 from public.journey_steps s where s.operation_id = _op.id) then
    raise exception 'This operation already has journey steps';
  end if;
  if exists (select 1 from public.operation_journey_provisionings p where p.operation_id = _op.id) then
    raise exception 'This operation has already been provisioned from a blueprint';
  end if;

  _anchor := coalesce(_anchor_start, _op.planned_start);
  if _anchor is null then
    raise exception 'An anchor start is required: the operation has no planned start';
  end if;

  _report := public.validate_blueprint_version(_v.id);
  if not (_report->>'valid')::boolean then
    raise exception 'This version is no longer valid: %', _report->'violations';
  end if;

  perform set_config('app.w04_control','on', true);
  perform set_config('app.blueprint_control','on', true);
  for _s in select * from public.journey_blueprint_steps s where s.version_id = _v.id order by s.sequence loop
    _req := coalesce(_s.presence_requirement, app_private.w04_default_presence_requirement(_s.step_kind));
    perform app_private.w04_assert_presence_contract(_s.step_kind, _req, _s.presence_population);
    insert into public.journey_steps (tenant_id, operation_id, sequence, title, description, step_kind,
      plan_origin, planned_start, planned_end, location_label, traveler_label, traveler_facing,
      presence_requirement, presence_population, created_by,
      source_blueprint_version_id, source_blueprint_step_id)
    values (_op.tenant_id, _op.id, _s.sequence, _s.title, _s.description, _s.step_kind,
      'planned', _anchor + make_interval(mins => _s.start_offset_minutes),
      case when _s.duration_minutes is null then null
           else _anchor + make_interval(mins => _s.start_offset_minutes + _s.duration_minutes) end,
      _s.location_label, _s.traveler_label, _s.traveler_facing,
      _req, _s.presence_population, auth.uid(), _v.id, _s.id)
    returning * into _new;
    _steps := _steps || jsonb_build_object('journey_step_id', _new.id, 'sequence', _new.sequence,
      'title', _new.title, 'step_kind', _new.step_kind, 'planned_start', _new.planned_start,
      'planned_end', _new.planned_end, 'presence_requirement', _new.presence_requirement,
      'source_blueprint_step_id', _s.id);
  end loop;

  insert into public.operation_journey_provisionings (tenant_id, operation_id, blueprint_id,
    blueprint_version_id, version_checksum, applied_by, idempotency_key)
  values (_op.tenant_id, _op.id, _b.id, _v.id, coalesce(_v.checksum,''), auth.uid(), _key);
  perform set_config('app.blueprint_control','off', true);
  perform set_config('app.w04_control','off', true);

  _count := jsonb_array_length(_steps);
  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'operation.journey_provisioned',
    'operation', _op.id, _key,
    jsonb_build_object('blueprint_id', _b.id, 'version_id', _v.id, 'version_number', _v.version_number,
      'checksum', _v.checksum, 'step_count', _count, 'operation_id', _op.id, 'anchor_start', _anchor));

  _existing := jsonb_build_object('operation_id', _op.id, 'blueprint_id', _b.id, 'version_id', _v.id,
    'version_number', _v.version_number, 'checksum', _v.checksum, 'anchor_start', _anchor,
    'step_count', _count, 'steps', _steps);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, auth.uid(), 'journey.blueprint_apply', _key, _existing);
  return _existing;
end;
$$;

revoke all on function public.create_journey_blueprint(uuid,text,text,text,text,text) from public;
revoke all on function public.create_blueprint_version(uuid,uuid,text,text) from public;
revoke all on function public.add_blueprint_step(uuid,text,journey_step_kind,integer,text,integer,text,integer,text,text,boolean,step_presence_requirement,step_presence_population) from public;
revoke all on function public.update_blueprint_step(uuid,text,text,journey_step_kind,integer,integer,boolean,text,text,text,boolean,step_presence_requirement,boolean,step_presence_population) from public;
revoke all on function public.remove_blueprint_step(uuid,text) from public;
revoke all on function public.reorder_blueprint_steps(uuid,uuid[],text) from public;
revoke all on function public.validate_blueprint_version(uuid) from public;
revoke all on function public.publish_blueprint_version(uuid,text) from public;
revoke all on function public.archive_journey_blueprint(uuid,text,text) from public;
revoke all on function public.apply_journey_blueprint_to_operation(uuid,uuid,text,timestamptz) from public;

grant execute on function public.create_journey_blueprint(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.create_blueprint_version(uuid,uuid,text,text) to authenticated;
grant execute on function public.add_blueprint_step(uuid,text,journey_step_kind,integer,text,integer,text,integer,text,text,boolean,step_presence_requirement,step_presence_population) to authenticated;
grant execute on function public.update_blueprint_step(uuid,text,text,journey_step_kind,integer,integer,boolean,text,text,text,boolean,step_presence_requirement,boolean,step_presence_population) to authenticated;
grant execute on function public.remove_blueprint_step(uuid,text) to authenticated;
grant execute on function public.reorder_blueprint_steps(uuid,uuid[],text) to authenticated;
grant execute on function public.validate_blueprint_version(uuid) to authenticated;
grant execute on function public.publish_blueprint_version(uuid,text) to authenticated;
grant execute on function public.archive_journey_blueprint(uuid,text,text) to authenticated;
grant execute on function public.apply_journey_blueprint_to_operation(uuid,uuid,text,timestamptz) to authenticated;