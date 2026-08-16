-- V3.5 — Blueprint Visit Points
-- Extends journey blueprints so interpretive visit points are versioned and provisioned
-- together with their parent journey steps.

create table public.journey_blueprint_visit_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version_id uuid not null references public.journey_blueprint_versions(id) on delete cascade,
  blueprint_step_id uuid not null references public.journey_blueprint_steps(id) on delete cascade,
  sequence integer not null,
  title text not null,
  interpretation text,
  guide_tip text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_blueprint_visit_points_sequence_positive check (sequence > 0),
  constraint journey_blueprint_visit_points_title_present check (btrim(title) <> ''),
  constraint journey_blueprint_visit_points_step_sequence_unique unique (blueprint_step_id, sequence)
);

create index journey_blueprint_visit_points_version_idx
  on public.journey_blueprint_visit_points(version_id, blueprint_step_id, sequence);

create index journey_blueprint_visit_points_tenant_idx
  on public.journey_blueprint_visit_points(tenant_id);

alter table public.journey_blueprint_visit_points enable row level security;

create policy journey_blueprint_visit_points_select
  on public.journey_blueprint_visit_points
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      where m.tenant_id = journey_blueprint_visit_points.tenant_id
        and m.profile_id = auth.uid()
        and m.status = 'active'
    )
  );

create trigger journey_blueprint_visit_points_updated_at
  before update on public.journey_blueprint_visit_points
  for each row execute function public.set_updated_at();

create trigger journey_blueprint_visit_points_guard
  before insert or update or delete on public.journey_blueprint_visit_points
  for each row execute function public.guard_blueprint_mutation();

create or replace function public.guard_blueprint_visit_point_immutability()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _version_id uuid := coalesce(new.version_id, old.version_id);
  _step_id uuid := coalesce(new.blueprint_step_id, old.blueprint_step_id);
  _version public.journey_blueprint_versions;
  _step public.journey_blueprint_steps;
begin
  select * into _version from public.journey_blueprint_versions where id = _version_id;
  if _version.id is null then raise exception 'Blueprint version not found'; end if;
  if _version.status <> 'draft' then
    raise exception 'Blueprint visit points can only change while the version is a draft';
  end if;

  select * into _step from public.journey_blueprint_steps where id = _step_id;
  if _step.id is null then raise exception 'Blueprint step not found'; end if;
  if _step.version_id <> _version.id or _step.tenant_id <> _version.tenant_id then
    raise exception 'Blueprint visit point must belong to a step in the same version';
  end if;

  if tg_op = 'UPDATE' then
    if new.version_id is distinct from old.version_id
       or new.blueprint_step_id is distinct from old.blueprint_step_id
       or new.tenant_id is distinct from old.tenant_id then
      raise exception 'A blueprint visit point cannot move between steps, versions or organisations';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.tenant_id <> _version.tenant_id then
      raise exception 'Blueprint visit point belongs to another organisation';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

create trigger journey_blueprint_visit_points_immutability
  before insert or update or delete on public.journey_blueprint_visit_points
  for each row execute function public.guard_blueprint_visit_point_immutability();

create or replace function public.add_blueprint_visit_point(
  _blueprint_step_id uuid,
  _title text,
  _idempotency_key text,
  _interpretation text default null,
  _guide_tip text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _existing jsonb;
  _step public.journey_blueprint_steps;
  _version public.journey_blueprint_versions;
  _row public.journey_blueprint_visit_points;
  _seq integer;
  _title_clean text := nullif(btrim(coalesce(_title, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _title_clean is null then raise exception 'Visit point title is required'; end if;

  select * into _step from public.journey_blueprint_steps where id = _blueprint_step_id;
  if _step.id is null then raise exception 'Blueprint step not found'; end if;
  _version := app_private.blueprint_version_ctx(
    _step.version_id,
    array['owner','admin','operations_agent']
  );
  if _version.status <> 'draft' then
    raise exception 'Only a draft blueprint version can receive visit points';
  end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_interpretation, '')), ''));
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_guide_tip, '')), ''));

  select k.result into _existing
  from public.idempotency_keys k
  where k.actor_profile_id = auth.uid()
    and k.action = 'blueprint.visit_point_add'
    and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  select coalesce(max(p.sequence), 0) + 10 into _seq
  from public.journey_blueprint_visit_points p
  where p.blueprint_step_id = _step.id;

  perform set_config('app.blueprint_control', 'on', true);
  insert into public.journey_blueprint_visit_points (
    tenant_id, version_id, blueprint_step_id, sequence, title,
    interpretation, guide_tip, created_by
  ) values (
    _version.tenant_id, _version.id, _step.id, _seq, _title_clean,
    nullif(btrim(coalesce(_interpretation, '')), ''),
    nullif(btrim(coalesce(_guide_tip, '')), ''),
    auth.uid()
  ) returning * into _row;
  perform set_config('app.blueprint_control', 'off', true);

  perform app_private.record_audit_event(
    _version.tenant_id, auth.uid(), 'journey_blueprint_visit_point.added',
    'journey_blueprint_visit_point', _row.id, _key,
    jsonb_build_object(
      'version_id', _version.id,
      'blueprint_step_id', _step.id,
      'sequence', _row.sequence,
      'title', _row.title
    )
  );

  _existing := jsonb_build_object(
    'blueprint_visit_point_id', _row.id,
    'blueprint_step_id', _step.id,
    'sequence', _row.sequence
  );
  insert into public.idempotency_keys (
    tenant_id, actor_profile_id, action, idempotency_key, result
  ) values (
    _version.tenant_id, auth.uid(), 'blueprint.visit_point_add', _key, _existing
  );
  return _existing;
end;
$function$;

create or replace function public.update_blueprint_visit_point(
  _visit_point_id uuid,
  _title text,
  _idempotency_key text,
  _interpretation text default null,
  _guide_tip text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _existing jsonb;
  _row public.journey_blueprint_visit_points;
  _version public.journey_blueprint_versions;
  _title_clean text := nullif(btrim(coalesce(_title, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _title_clean is null then raise exception 'Visit point title is required'; end if;

  select * into _row from public.journey_blueprint_visit_points where id = _visit_point_id;
  if _row.id is null then raise exception 'Blueprint visit point not found'; end if;
  _version := app_private.blueprint_version_ctx(
    _row.version_id,
    array['owner','admin','operations_agent']
  );
  if _version.status <> 'draft' then
    raise exception 'Only visit points of a draft blueprint version can be changed';
  end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_interpretation, '')), ''));
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_guide_tip, '')), ''));

  select k.result into _existing
  from public.idempotency_keys k
  where k.actor_profile_id = auth.uid()
    and k.action = 'blueprint.visit_point_update'
    and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  perform set_config('app.blueprint_control', 'on', true);
  update public.journey_blueprint_visit_points p
  set title = _title_clean,
      interpretation = nullif(btrim(coalesce(_interpretation, '')), ''),
      guide_tip = nullif(btrim(coalesce(_guide_tip, '')), '')
  where p.id = _row.id
  returning * into _row;
  perform set_config('app.blueprint_control', 'off', true);

  perform app_private.record_audit_event(
    _version.tenant_id, auth.uid(), 'journey_blueprint_visit_point.updated',
    'journey_blueprint_visit_point', _row.id, _key,
    jsonb_build_object(
      'version_id', _version.id,
      'blueprint_step_id', _row.blueprint_step_id,
      'sequence', _row.sequence,
      'title', _row.title
    )
  );

  _existing := jsonb_build_object('blueprint_visit_point_id', _row.id);
  insert into public.idempotency_keys (
    tenant_id, actor_profile_id, action, idempotency_key, result
  ) values (
    _version.tenant_id, auth.uid(), 'blueprint.visit_point_update', _key, _existing
  );
  return _existing;
end;
$function$;

create or replace function public.remove_blueprint_visit_point(
  _visit_point_id uuid,
  _idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _existing jsonb;
  _row public.journey_blueprint_visit_points;
  _version public.journey_blueprint_versions;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select * into _row from public.journey_blueprint_visit_points where id = _visit_point_id;
  if _row.id is null then raise exception 'Blueprint visit point not found'; end if;
  _version := app_private.blueprint_version_ctx(
    _row.version_id,
    array['owner','admin','operations_agent']
  );
  if _version.status <> 'draft' then
    raise exception 'Only visit points of a draft blueprint version can be removed';
  end if;

  select k.result into _existing
  from public.idempotency_keys k
  where k.actor_profile_id = auth.uid()
    and k.action = 'blueprint.visit_point_remove'
    and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  perform set_config('app.blueprint_control', 'on', true);
  delete from public.journey_blueprint_visit_points where id = _row.id;
  perform set_config('app.blueprint_control', 'off', true);

  perform app_private.record_audit_event(
    _version.tenant_id, auth.uid(), 'journey_blueprint_visit_point.removed',
    'journey_blueprint_visit_point', _row.id, _key,
    jsonb_build_object(
      'version_id', _version.id,
      'blueprint_step_id', _row.blueprint_step_id,
      'sequence', _row.sequence
    )
  );

  _existing := jsonb_build_object(
    'blueprint_visit_point_id', _row.id,
    'removed', true
  );
  insert into public.idempotency_keys (
    tenant_id, actor_profile_id, action, idempotency_key, result
  ) values (
    _version.tenant_id, auth.uid(), 'blueprint.visit_point_remove', _key, _existing
  );
  return _existing;
end;
$function$;

create or replace function public.reorder_blueprint_visit_points(
  _blueprint_step_id uuid,
  _ordered_visit_point_ids uuid[],
  _idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _existing jsonb;
  _step public.journey_blueprint_steps;
  _version public.journey_blueprint_versions;
  _total integer;
  _given integer;
  _shift integer;
  _i integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select * into _step from public.journey_blueprint_steps where id = _blueprint_step_id;
  if _step.id is null then raise exception 'Blueprint step not found'; end if;
  _version := app_private.blueprint_version_ctx(
    _step.version_id,
    array['owner','admin','operations_agent']
  );
  if _version.status <> 'draft' then
    raise exception 'Only visit points of a draft blueprint version can be reordered';
  end if;

  select k.result into _existing
  from public.idempotency_keys k
  where k.actor_profile_id = auth.uid()
    and k.action = 'blueprint.visit_point_reorder'
    and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  select count(*) into _total
  from public.journey_blueprint_visit_points p
  where p.blueprint_step_id = _step.id;

  select count(distinct x) into _given
  from unnest(coalesce(_ordered_visit_point_ids, '{}'::uuid[])) x;

  if _given <> coalesce(array_length(_ordered_visit_point_ids, 1), 0) then
    raise exception 'The ordered list cannot repeat a visit point';
  end if;
  if _given <> _total then
    raise exception 'The ordered list must contain every visit point of this step exactly once';
  end if;
  if exists (
    select 1 from unnest(_ordered_visit_point_ids) x
    where not exists (
      select 1 from public.journey_blueprint_visit_points p
      where p.id = x and p.blueprint_step_id = _step.id
    )
  ) then
    raise exception 'The ordered list references a visit point from another step';
  end if;

  if _total > 0 then
    select coalesce(max(p.sequence), 0) + 1000 into _shift
    from public.journey_blueprint_visit_points p
    where p.blueprint_step_id = _step.id;

    perform set_config('app.blueprint_control', 'on', true);
    update public.journey_blueprint_visit_points p
    set sequence = p.sequence + _shift
    where p.blueprint_step_id = _step.id;

    for _i in 1 .. array_length(_ordered_visit_point_ids, 1) loop
      update public.journey_blueprint_visit_points p
      set sequence = _i * 10
      where p.id = _ordered_visit_point_ids[_i];
    end loop;
    perform set_config('app.blueprint_control', 'off', true);
  end if;

  perform app_private.record_audit_event(
    _version.tenant_id, auth.uid(), 'journey_blueprint_visit_point.reordered',
    'journey_blueprint_step', _step.id, _key,
    jsonb_build_object('version_id', _version.id, 'visit_point_count', _total)
  );

  _existing := jsonb_build_object(
    'blueprint_step_id', _step.id,
    'visit_point_count', _total
  );
  insert into public.idempotency_keys (
    tenant_id, actor_profile_id, action, idempotency_key, result
  ) values (
    _version.tenant_id, auth.uid(), 'blueprint.visit_point_reorder', _key, _existing
  );
  return _existing;
end;
$function$;

create or replace function app_private.blueprint_checksum(_version_id uuid)
returns text
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  with step_lines as (
    select
      s.sequence as step_sequence,
      concat_ws('|',
        'STEP',
        s.sequence::text,
        btrim(s.title),
        s.step_kind::text,
        s.start_offset_minutes::text,
        coalesce(s.duration_minutes::text, '-'),
        coalesce(btrim(s.description), ''),
        coalesce(btrim(s.location_label), ''),
        coalesce(btrim(s.traveler_label), ''),
        s.traveler_facing::text,
        coalesce(s.presence_requirement::text, 'default'),
        s.presence_population::text
      ) as line
    from public.journey_blueprint_steps s
    where s.version_id = _version_id
  ), point_lines as (
    select
      s.sequence as step_sequence,
      p.sequence as point_sequence,
      concat_ws('|',
        'POINT',
        s.sequence::text,
        p.sequence::text,
        btrim(p.title),
        coalesce(btrim(p.interpretation), ''),
        coalesce(btrim(p.guide_tip), '')
      ) as line
    from public.journey_blueprint_visit_points p
    join public.journey_blueprint_steps s on s.id = p.blueprint_step_id
    where p.version_id = _version_id
  ), canonical as (
    select step_sequence, 0 as point_sequence, line from step_lines
    union all
    select step_sequence, point_sequence, line from point_lines
  )
  select md5(coalesce(string_agg(line, E'\n' order by step_sequence, point_sequence), ''))
  from canonical
$function$;

create or replace function public.validate_blueprint_version(_version_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _v public.journey_blueprint_versions;
  _b public.journey_blueprints;
  _violations jsonb := '[]'::jsonb;
  _s record;
  _p record;
  _prev_offset integer := null;
  _req public.step_presence_requirement;
  _count integer;
begin
  _v := app_private.blueprint_version_ctx(
    _version_id,
    array['owner','admin','operations_agent','member']
  );
  select * into _b from public.journey_blueprints b where b.id = _v.blueprint_id;

  if _b.status <> 'active' then
    _violations := _violations || jsonb_build_object(
      'code','blueprint_archived','message','The blueprint is archived'
    );
  end if;
  if _b.tenant_id <> _v.tenant_id then
    _violations := _violations || jsonb_build_object(
      'code','tenant_mismatch','message','Version and blueprint belong to different organisations'
    );
  end if;

  select count(*) into _count
  from public.journey_blueprint_steps s
  where s.version_id = _v.id;
  if _count = 0 then
    _violations := _violations || jsonb_build_object(
      'code','no_steps','message','A version needs at least one step'
    );
  end if;

  for _s in
    select * from public.journey_blueprint_steps s
    where s.version_id = _v.id
    order by s.sequence
  loop
    if _s.tenant_id <> _v.tenant_id then
      _violations := _violations || jsonb_build_object(
        'code','tenant_mismatch','sequence',_s.sequence,
        'message','Step belongs to another organisation'
      );
    end if;
    if btrim(coalesce(_s.title,'')) = '' then
      _violations := _violations || jsonb_build_object(
        'code','empty_title','sequence',_s.sequence,'message','Step title is empty'
      );
    end if;
    if _s.sequence <= 0 then
      _violations := _violations || jsonb_build_object(
        'code','invalid_sequence','sequence',_s.sequence,'message','Sequence must be positive'
      );
    end if;
    if _s.start_offset_minutes < 0 then
      _violations := _violations || jsonb_build_object(
        'code','invalid_offset','sequence',_s.sequence,'message','Offset cannot be negative'
      );
    end if;
    if _prev_offset is not null and _s.start_offset_minutes < _prev_offset then
      _violations := _violations || jsonb_build_object(
        'code','offset_not_monotonic','sequence',_s.sequence,
        'message','Offsets must not decrease along the sequence'
      );
    end if;
    _prev_offset := _s.start_offset_minutes;
    if _s.duration_minutes is not null and _s.duration_minutes <= 0 then
      _violations := _violations || jsonb_build_object(
        'code','invalid_duration','sequence',_s.sequence,'message','Duration must be positive'
      );
    end if;
    _req := coalesce(
      _s.presence_requirement,
      app_private.w04_default_presence_requirement(_s.step_kind)
    );
    begin
      perform app_private.w04_assert_presence_contract(
        _s.step_kind, _req, _s.presence_population
      );
    exception when others then
      _violations := _violations || jsonb_build_object(
        'code','presence_contract','sequence',_s.sequence,'message',sqlerrm
      );
    end;
  end loop;

  for _p in
    select p.*, s.sequence as step_sequence, s.version_id as parent_version_id,
           s.tenant_id as parent_tenant_id
    from public.journey_blueprint_visit_points p
    join public.journey_blueprint_steps s on s.id = p.blueprint_step_id
    where p.version_id = _v.id
    order by s.sequence, p.sequence
  loop
    if _p.tenant_id <> _v.tenant_id
       or _p.parent_tenant_id <> _v.tenant_id
       or _p.parent_version_id <> _v.id then
      _violations := _violations || jsonb_build_object(
        'code','visit_point_tenant_or_version_mismatch',
        'sequence',_p.step_sequence,
        'message','Visit point belongs to another organisation or version'
      );
    end if;
    if btrim(coalesce(_p.title, '')) = '' then
      _violations := _violations || jsonb_build_object(
        'code','visit_point_empty_title','sequence',_p.step_sequence,
        'message','Visit point title is empty'
      );
    end if;
    if _p.sequence <= 0 then
      _violations := _violations || jsonb_build_object(
        'code','visit_point_invalid_sequence','sequence',_p.step_sequence,
        'message','Visit point sequence must be positive'
      );
    end if;
  end loop;

  return jsonb_build_object(
    'version_id', _v.id,
    'status', _v.status,
    'step_count', _count,
    'visit_point_count', (
      select count(*)
      from public.journey_blueprint_visit_points p
      where p.version_id = _v.id
    ),
    'valid', jsonb_array_length(_violations) = 0,
    'violations', _violations
  );
end;
$function$;

create or replace function public.create_blueprint_version(
  _blueprint_id uuid,
  _from_version_id uuid,
  _idempotency_key text,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _key text := nullif(btrim(coalesce(_idempotency_key,'')), '');
  _existing jsonb;
  _b public.journey_blueprints;
  _src public.journey_blueprint_versions;
  _v public.journey_blueprint_versions;
  _src_step public.journey_blueprint_steps;
  _new_step public.journey_blueprint_steps;
  _next integer;
begin
  select * into _b from public.journey_blueprints b where b.id = _blueprint_id;
  if _b.id is null then raise exception 'Blueprint not found'; end if;
  perform app_private.blueprint_require_role(
    _b.tenant_id,
    array['owner','admin','operations_agent']
  );
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select k.result into _existing
  from public.idempotency_keys k
  where k.actor_profile_id = auth.uid()
    and k.action = 'blueprint.version_create'
    and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  if _b.status <> 'active' then
    raise exception 'An archived blueprint cannot receive new versions';
  end if;
  if exists (
    select 1 from public.journey_blueprint_versions v
    where v.blueprint_id = _b.id and v.status = 'draft'
  ) then
    raise exception 'This blueprint already has an open draft version';
  end if;

  select * into _src
  from public.journey_blueprint_versions v
  where v.id = _from_version_id;
  if _src.id is null or _src.blueprint_id <> _b.id then
    raise exception 'The source version must belong to this blueprint';
  end if;
  if _src.status <> 'published' then
    raise exception 'A new version can only be created from a published version';
  end if;

  select coalesce(max(v.version_number), 0) + 1 into _next
  from public.journey_blueprint_versions v
  where v.blueprint_id = _b.id;

  perform set_config('app.blueprint_control', 'on', true);
  insert into public.journey_blueprint_versions (
    tenant_id, blueprint_id, version_number, notes, created_by
  ) values (
    _b.tenant_id, _b.id, _next,
    nullif(btrim(coalesce(_notes,'')), ''), auth.uid()
  ) returning * into _v;

  for _src_step in
    select * from public.journey_blueprint_steps s
    where s.version_id = _src.id
    order by s.sequence
  loop
    insert into public.journey_blueprint_steps (
      tenant_id, version_id, sequence, title, description, step_kind,
      start_offset_minutes, duration_minutes, location_label, traveler_label,
      traveler_facing, presence_requirement, presence_population, metadata
    ) values (
      _b.tenant_id, _v.id, _src_step.sequence, _src_step.title,
      _src_step.description, _src_step.step_kind, _src_step.start_offset_minutes,
      _src_step.duration_minutes, _src_step.location_label,
      _src_step.traveler_label, _src_step.traveler_facing,
      _src_step.presence_requirement, _src_step.presence_population,
      _src_step.metadata
    ) returning * into _new_step;

    insert into public.journey_blueprint_visit_points (
      tenant_id, version_id, blueprint_step_id, sequence, title,
      interpretation, guide_tip, metadata, created_by
    )
    select
      _b.tenant_id, _v.id, _new_step.id, p.sequence, p.title,
      p.interpretation, p.guide_tip, p.metadata, auth.uid()
    from public.journey_blueprint_visit_points p
    where p.blueprint_step_id = _src_step.id
    order by p.sequence;
  end loop;

  update public.journey_blueprint_versions
  set step_count = (
    select count(*) from public.journey_blueprint_steps s where s.version_id = _v.id
  )
  where id = _v.id;
  perform set_config('app.blueprint_control', 'off', true);

  perform app_private.record_audit_event(
    _b.tenant_id, auth.uid(), 'journey_blueprint_version.created',
    'journey_blueprint_version', _v.id, _key,
    jsonb_build_object(
      'blueprint_id', _b.id,
      'version_number', _next,
      'cloned_from', _src.id,
      'visit_point_count', (
        select count(*) from public.journey_blueprint_visit_points p
        where p.version_id = _v.id
      )
    )
  );

  _existing := jsonb_build_object(
    'version_id', _v.id,
    'version_number', _next
  );
  insert into public.idempotency_keys (
    tenant_id, actor_profile_id, action, idempotency_key, result
  ) values (
    _b.tenant_id, auth.uid(), 'blueprint.version_create', _key, _existing
  );
  return _existing;
end;
$function$;

create or replace function public.apply_journey_blueprint_to_operation(
  _operation_id uuid,
  _version_id uuid,
  _idempotency_key text,
  _anchor_start timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _key text := nullif(btrim(coalesce(_idempotency_key,'')), '');
  _existing jsonb;
  _op public.operations;
  _v public.journey_blueprint_versions;
  _b public.journey_blueprints;
  _anchor timestamptz;
  _s record;
  _req public.step_presence_requirement;
  _steps jsonb := '[]'::jsonb;
  _new public.journey_steps;
  _report jsonb;
  _count integer;
  _visit_point_count integer := 0;
begin
  _op := app_private.w04_operation(
    _operation_id,
    array['owner','admin','operations_agent']
  );
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select k.result into _existing
  from public.idempotency_keys k
  where k.actor_profile_id = auth.uid()
    and k.action = 'journey.blueprint_apply'
    and k.idempotency_key = _key;
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
  if exists (
    select 1 from public.operation_journey_provisionings p where p.operation_id = _op.id
  ) then
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

  perform set_config('app.w04_control', 'on', true);
  perform set_config('app.blueprint_control', 'on', true);

  for _s in
    select * from public.journey_blueprint_steps s
    where s.version_id = _v.id
    order by s.sequence
  loop
    _req := coalesce(
      _s.presence_requirement,
      app_private.w04_default_presence_requirement(_s.step_kind)
    );
    perform app_private.w04_assert_presence_contract(
      _s.step_kind, _req, _s.presence_population
    );

    insert into public.journey_steps (
      tenant_id, operation_id, sequence, title, description, step_kind,
      plan_origin, planned_start, planned_end, location_label, traveler_label,
      traveler_facing, presence_requirement, presence_population, created_by,
      source_blueprint_version_id, source_blueprint_step_id
    ) values (
      _op.tenant_id, _op.id, _s.sequence, _s.title, _s.description, _s.step_kind,
      'planned',
      _anchor + make_interval(mins => _s.start_offset_minutes),
      case
        when _s.duration_minutes is null then null
        else _anchor + make_interval(
          mins => _s.start_offset_minutes + _s.duration_minutes
        )
      end,
      _s.location_label, _s.traveler_label, _s.traveler_facing,
      _req, _s.presence_population, auth.uid(), _v.id, _s.id
    ) returning * into _new;

    insert into public.journey_visit_points (
      tenant_id, operation_id, journey_step_id, sequence, title,
      interpretation, guide_tip, metadata, created_by
    )
    select
      _op.tenant_id, _op.id, _new.id, p.sequence, p.title,
      p.interpretation, p.guide_tip,
      coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'source_blueprint_visit_point_id', p.id,
        'source_blueprint_version_id', _v.id
      ),
      auth.uid()
    from public.journey_blueprint_visit_points p
    where p.blueprint_step_id = _s.id
    order by p.sequence;

    get diagnostics _count = row_count;
    _visit_point_count := _visit_point_count + _count;

    _steps := _steps || jsonb_build_object(
      'journey_step_id', _new.id,
      'sequence', _new.sequence,
      'title', _new.title,
      'step_kind', _new.step_kind,
      'planned_start', _new.planned_start,
      'planned_end', _new.planned_end,
      'presence_requirement', _new.presence_requirement,
      'source_blueprint_step_id', _s.id,
      'visit_point_count', _count
    );
  end loop;

  insert into public.operation_journey_provisionings (
    tenant_id, operation_id, blueprint_id, blueprint_version_id,
    version_checksum, applied_by, idempotency_key
  ) values (
    _op.tenant_id, _op.id, _b.id, _v.id,
    coalesce(_v.checksum,''), auth.uid(), _key
  );

  perform set_config('app.blueprint_control', 'off', true);
  perform set_config('app.w04_control', 'off', true);

  _count := jsonb_array_length(_steps);
  perform app_private.record_audit_event(
    _op.tenant_id, auth.uid(), 'operation.journey_provisioned',
    'operation', _op.id, _key,
    jsonb_build_object(
      'blueprint_id', _b.id,
      'version_id', _v.id,
      'version_number', _v.version_number,
      'checksum', _v.checksum,
      'step_count', _count,
      'visit_point_count', _visit_point_count,
      'operation_id', _op.id,
      'anchor_start', _anchor
    )
  );

  _existing := jsonb_build_object(
    'operation_id', _op.id,
    'blueprint_id', _b.id,
    'version_id', _v.id,
    'version_number', _v.version_number,
    'checksum', _v.checksum,
    'anchor_start', _anchor,
    'step_count', _count,
    'visit_point_count', _visit_point_count,
    'steps', _steps
  );
  insert into public.idempotency_keys (
    tenant_id, actor_profile_id, action, idempotency_key, result
  ) values (
    _op.tenant_id, auth.uid(), 'journey.blueprint_apply', _key, _existing
  );
  return _existing;
end;
$function$;

revoke all on table public.journey_blueprint_visit_points from anon;
grant select on table public.journey_blueprint_visit_points to authenticated;

revoke all on function public.add_blueprint_visit_point(uuid, text, text, text, text) from public, anon;
revoke all on function public.update_blueprint_visit_point(uuid, text, text, text, text) from public, anon;
revoke all on function public.remove_blueprint_visit_point(uuid, text) from public, anon;
revoke all on function public.reorder_blueprint_visit_points(uuid, uuid[], text) from public, anon;

grant execute on function public.add_blueprint_visit_point(uuid, text, text, text, text) to authenticated;
grant execute on function public.update_blueprint_visit_point(uuid, text, text, text, text) to authenticated;
grant execute on function public.remove_blueprint_visit_point(uuid, text) to authenticated;
grant execute on function public.reorder_blueprint_visit_points(uuid, uuid[], text) to authenticated;
