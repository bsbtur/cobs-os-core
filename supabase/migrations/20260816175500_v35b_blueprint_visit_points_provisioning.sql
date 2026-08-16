-- V3.5B — Clone blueprint visit points across versions and provision them to operations.

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
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _existing jsonb;
  _b public.journey_blueprints;
  _src public.journey_blueprint_versions;
  _v public.journey_blueprint_versions;
  _src_step public.journey_blueprint_steps;
  _new_step public.journey_blueprint_steps;
  _next int;
  _visit_point_count int := 0;
begin
  select * into _b from public.journey_blueprints b where b.id = _blueprint_id;
  if _b.id is null then raise exception 'Blueprint not found'; end if;
  perform app_private.blueprint_require_role(_b.tenant_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select k.result into _existing from public.idempotency_keys k
  where k.actor_profile_id = auth.uid()
    and k.action = 'blueprint.version_create'
    and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  if _b.status <> 'active' then raise exception 'An archived blueprint cannot receive new versions'; end if;
  if exists (
    select 1 from public.journey_blueprint_versions v
    where v.blueprint_id = _b.id and v.status = 'draft'
  ) then
    raise exception 'This blueprint already has an open draft version';
  end if;

  select * into _src from public.journey_blueprint_versions v where v.id = _from_version_id;
  if _src.id is null or _src.blueprint_id <> _b.id then
    raise exception 'The source version must belong to this blueprint';
  end if;
  if _src.status <> 'published' then
    raise exception 'A new version can only be created from a published version';
  end if;

  select coalesce(max(v.version_number),0) + 1 into _next
  from public.journey_blueprint_versions v where v.blueprint_id = _b.id;

  perform set_config('app.blueprint_control','on', true);
  insert into public.journey_blueprint_versions (
    tenant_id, blueprint_id, version_number, notes, created_by
  ) values (
    _b.tenant_id, _b.id, _next, nullif(btrim(coalesce(_notes,'')),''), auth.uid()
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
      _src_step.duration_minutes, _src_step.location_label, _src_step.traveler_label,
      _src_step.traveler_facing, _src_step.presence_requirement,
      _src_step.presence_population, _src_step.metadata
    ) returning * into _new_step;

    insert into public.journey_blueprint_visit_points (
      tenant_id, version_id, blueprint_step_id, sequence, title,
      interpretation, guide_tip, metadata, created_by
    )
    select _b.tenant_id, _v.id, _new_step.id, p.sequence, p.title,
      p.interpretation, p.guide_tip, p.metadata, auth.uid()
    from public.journey_blueprint_visit_points p
    where p.blueprint_step_id = _src_step.id
    order by p.sequence;

    get diagnostics _visit_point_count = _visit_point_count + row_count;
  end loop;

  update public.journey_blueprint_versions set step_count = (
    select count(*) from public.journey_blueprint_steps s where s.version_id = _v.id
  ) where id = _v.id;
  perform set_config('app.blueprint_control','off', true);

  perform app_private.record_audit_event(
    _b.tenant_id, auth.uid(), 'journey_blueprint_version.created',
    'journey_blueprint_version', _v.id, _key,
    jsonb_build_object(
      'blueprint_id', _b.id,
      'version_number', _next,
      'cloned_from', _src.id,
      'visit_point_count', (
        select count(*) from public.journey_blueprint_visit_points p where p.version_id = _v.id
      )
    )
  );

  _existing := jsonb_build_object(
    'version_id', _v.id,
    'version_number', _next,
    'visit_point_count', (
      select count(*) from public.journey_blueprint_visit_points p where p.version_id = _v.id
    )
  );
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_b.tenant_id, auth.uid(), 'blueprint.version_create', _key, _existing);
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
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
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
  _count int;
  _inserted_points int;
  _visit_point_count int := 0;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select k.result into _existing from public.idempotency_keys k
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

  perform set_config('app.w04_control','on', true);
  perform set_config('app.blueprint_control','on', true);

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
      case when _s.duration_minutes is null then null
           else _anchor + make_interval(mins => _s.start_offset_minutes + _s.duration_minutes) end,
      _s.location_label, _s.traveler_label, _s.traveler_facing,
      _req, _s.presence_population, auth.uid(), _v.id, _s.id
    ) returning * into _new;

    insert into public.journey_visit_points (
      tenant_id, operation_id, journey_step_id, sequence, title,
      interpretation, guide_tip, metadata, created_by
    )
    select _op.tenant_id, _op.id, _new.id, p.sequence, p.title,
      p.interpretation, p.guide_tip,
      coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'source_blueprint_visit_point_id', p.id,
        'source_blueprint_version_id', _v.id
      ), auth.uid()
    from public.journey_blueprint_visit_points p
    where p.blueprint_step_id = _s.id
    order by p.sequence;

    get diagnostics _inserted_points = row_count;
    _visit_point_count := _visit_point_count + _inserted_points;

    _steps := _steps || jsonb_build_object(
      'journey_step_id', _new.id,
      'sequence', _new.sequence,
      'title', _new.title,
      'step_kind', _new.step_kind,
      'planned_start', _new.planned_start,
      'planned_end', _new.planned_end,
      'presence_requirement', _new.presence_requirement,
      'source_blueprint_step_id', _s.id,
      'visit_point_count', _inserted_points
    );
  end loop;

  insert into public.operation_journey_provisionings (
    tenant_id, operation_id, blueprint_id, blueprint_version_id,
    version_checksum, applied_by, idempotency_key
  ) values (
    _op.tenant_id, _op.id, _b.id, _v.id, coalesce(_v.checksum,''), auth.uid(), _key
  );

  perform set_config('app.blueprint_control','off', true);
  perform set_config('app.w04_control','off', true);

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
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, auth.uid(), 'journey.blueprint_apply', _key, _existing);
  return _existing;
end;
$function$;
