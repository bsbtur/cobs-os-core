-- L3-C Journey canonical parity recovery.
-- Source contract: COBS OS CLEAN BUILD. Target: STAGING V3.1.
-- Scope: Blueprint guards, creation/versioning and step CRUD.

create or replace function public.guard_blueprint_mutation()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  if not app_private.blueprint_control_active() then raise exception 'Journey blueprints can only change through the approved commands'; end if;
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then raise exception 'A journey blueprint record cannot change organisation'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_blueprint_version_immutability()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  if tg_op = 'DELETE' then if old.status <> 'draft' then raise exception 'A published blueprint version can never be deleted'; end if; return old; end if;
  if old.status = 'published' then raise exception 'Blueprint version % is published and is therefore immutable', old.version_number; end if;
  if old.status = 'archived' and new.status is distinct from old.status then raise exception 'An archived blueprint version cannot change status'; end if;
  if new.blueprint_id is distinct from old.blueprint_id or new.version_number is distinct from old.version_number then raise exception 'A blueprint version cannot be renumbered or moved'; end if;
  return new;
end;
$$;

create or replace function public.guard_blueprint_step_immutability()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
declare _status public.journey_blueprint_version_status;
begin
  select v.status into _status from public.journey_blueprint_versions v where v.id = coalesce(new.version_id, old.version_id);
  if _status is not null and _status <> 'draft' then raise exception 'Blueprint steps can only change while the version is a draft'; end if;
  if tg_op = 'UPDATE' and new.version_id is distinct from old.version_id then raise exception 'A blueprint step cannot move between versions'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_blueprint_visit_point_immutability()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
declare _version_id uuid := coalesce(new.version_id, old.version_id); _step_id uuid := coalesce(new.blueprint_step_id, old.blueprint_step_id); _version public.journey_blueprint_versions; _step public.journey_blueprint_steps;
begin
 select * into _version from public.journey_blueprint_versions where id = _version_id;
 if _version.id is null then raise exception 'Blueprint version not found'; end if;
 if _version.status <> 'draft' then raise exception 'Blueprint visit points can only change while the version is a draft'; end if;
 select * into _step from public.journey_blueprint_steps where id = _step_id;
 if _step.id is null then raise exception 'Blueprint step not found'; end if;
 if _step.version_id <> _version.id or _step.tenant_id <> _version.tenant_id then raise exception 'Blueprint visit point must belong to a step in the same version'; end if;
 if tg_op = 'UPDATE' and (new.version_id is distinct from old.version_id or new.blueprint_step_id is distinct from old.blueprint_step_id or new.tenant_id is distinct from old.tenant_id) then raise exception 'A blueprint visit point cannot move between steps, versions or organisations'; end if;
 if tg_op = 'INSERT' and new.tenant_id <> _version.tenant_id then raise exception 'Blueprint visit point belongs to another organisation'; end if;
 if tg_op = 'DELETE' then return old; end if;
 return new;
end;
$$;

create or replace function public.guard_blueprint_provisioning_append_only()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$ begin raise exception 'A journey provisioning record is permanent and cannot be changed or removed'; end; $$;

create or replace function public.guard_blueprint_no_delete()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$ begin raise exception 'Journey blueprints are archived, never deleted'; end; $$;

create or replace function public.create_journey_blueprint(_tenant_id uuid, _name text, _slug text, _idempotency_key text, _description text default null, _default_timezone text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _b public.journey_blueprints; _v public.journey_blueprint_versions;
begin
  perform app_private.blueprint_require_role(_tenant_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if btrim(coalesce(_name,'')) = '' then raise exception 'Blueprint name is required'; end if;
  if btrim(coalesce(_slug,'')) = '' then raise exception 'Blueprint slug is required'; end if;
  select k.result into _existing from public.idempotency_keys k where k.actor_profile_id = auth.uid() and k.action = 'blueprint.create' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;
  if exists (select 1 from public.journey_blueprints b where b.tenant_id = _tenant_id and b.slug = btrim(_slug)) then raise exception 'A blueprint with slug "%" already exists in this organisation', btrim(_slug); end if;
  perform set_config('app.blueprint_control','on', true);
  insert into public.journey_blueprints (tenant_id, name, slug, description, default_timezone, created_by) values (_tenant_id, btrim(_name), btrim(_slug), nullif(btrim(coalesce(_description,'')),''), nullif(btrim(coalesce(_default_timezone,'')),''), auth.uid()) returning * into _b;
  insert into public.journey_blueprint_versions (tenant_id, blueprint_id, version_number, created_by) values (_tenant_id, _b.id, 1, auth.uid()) returning * into _v;
  perform set_config('app.blueprint_control','off', true);
  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'journey_blueprint.created', 'journey_blueprint', _b.id, _key, jsonb_build_object('slug', _b.slug, 'version_id', _v.id));
  _existing := jsonb_build_object('blueprint_id', _b.id, 'version_id', _v.id, 'version_number', 1);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result) values (_tenant_id, auth.uid(), 'blueprint.create', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.create_blueprint_version(_blueprint_id uuid, _from_version_id uuid, _idempotency_key text, _notes text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _b public.journey_blueprints; _src public.journey_blueprint_versions; _v public.journey_blueprint_versions; _src_step public.journey_blueprint_steps; _new_step public.journey_blueprint_steps; _next int; _inserted_points int; _visit_point_count int:=0;
begin
 select * into _b from public.journey_blueprints b where b.id=_blueprint_id; if _b.id is null then raise exception 'Blueprint not found'; end if; perform app_private.blueprint_require_role(_b.tenant_id,array['owner','admin','operations_agent']); if _key is null then raise exception 'Idempotency key is required'; end if;
 select k.result into _existing from public.idempotency_keys k where k.actor_profile_id=auth.uid() and k.action='blueprint.version_create' and k.idempotency_key=_key; if _existing is not null then return _existing; end if;
 if _b.status<>'active' then raise exception 'An archived blueprint cannot receive new versions'; end if; if exists(select 1 from public.journey_blueprint_versions v where v.blueprint_id=_b.id and v.status='draft') then raise exception 'This blueprint already has an open draft version'; end if;
 select * into _src from public.journey_blueprint_versions v where v.id=_from_version_id; if _src.id is null or _src.blueprint_id<>_b.id then raise exception 'The source version must belong to this blueprint'; end if; if _src.status<>'published' then raise exception 'A new version can only be created from a published version'; end if;
 select coalesce(max(v.version_number),0)+1 into _next from public.journey_blueprint_versions v where v.blueprint_id=_b.id;
 perform set_config('app.blueprint_control','on',true); insert into public.journey_blueprint_versions(tenant_id,blueprint_id,version_number,notes,created_by) values(_b.tenant_id,_b.id,_next,nullif(btrim(coalesce(_notes,'')),''),auth.uid()) returning * into _v;
 for _src_step in select * from public.journey_blueprint_steps s where s.version_id=_src.id order by s.sequence loop
  insert into public.journey_blueprint_steps(tenant_id,version_id,sequence,title,description,step_kind,start_offset_minutes,duration_minutes,location_label,traveler_label,traveler_facing,presence_requirement,presence_population,metadata) values(_b.tenant_id,_v.id,_src_step.sequence,_src_step.title,_src_step.description,_src_step.step_kind,_src_step.start_offset_minutes,_src_step.duration_minutes,_src_step.location_label,_src_step.traveler_label,_src_step.traveler_facing,_src_step.presence_requirement,_src_step.presence_population,_src_step.metadata) returning * into _new_step;
  insert into public.journey_blueprint_visit_points(tenant_id,version_id,blueprint_step_id,sequence,title,interpretation,guide_tip,metadata,created_by) select _b.tenant_id,_v.id,_new_step.id,p.sequence,p.title,p.interpretation,p.guide_tip,p.metadata,auth.uid() from public.journey_blueprint_visit_points p where p.blueprint_step_id=_src_step.id order by p.sequence;
  get diagnostics _inserted_points = row_count; _visit_point_count:=_visit_point_count+_inserted_points;
 end loop;
 update public.journey_blueprint_versions set step_count=(select count(*) from public.journey_blueprint_steps s where s.version_id=_v.id) where id=_v.id; perform set_config('app.blueprint_control','off',true);
 perform app_private.record_audit_event(_b.tenant_id,auth.uid(),'journey_blueprint_version.created','journey_blueprint_version',_v.id,_key,jsonb_build_object('blueprint_id',_b.id,'version_number',_next,'cloned_from',_src.id,'visit_point_count',_visit_point_count));
 _existing:=jsonb_build_object('version_id',_v.id,'version_number',_next,'visit_point_count',_visit_point_count); insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result) values(_b.tenant_id,auth.uid(),'blueprint.version_create',_key,_existing); return _existing;
end;
$$;

create or replace function public.add_blueprint_step(_version_id uuid, _title text, _step_kind journey_step_kind, _start_offset_minutes integer, _idempotency_key text, _sequence integer default null, _description text default null, _duration_minutes integer default null, _location_label text default null, _traveler_label text default null, _traveler_facing boolean default false, _presence_requirement step_presence_requirement default null, _presence_population step_presence_population default 'participants')
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _v public.journey_blueprint_versions; _row public.journey_blueprint_steps; _seq int; _req public.step_presence_requirement; _pop public.step_presence_population;
begin
  _v := app_private.blueprint_version_ctx(_version_id, array['owner','admin','operations_agent']); if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k where k.actor_profile_id = auth.uid() and k.action = 'blueprint.step_add' and k.idempotency_key = _key; if _existing is not null then return _existing; end if;
  if _v.status <> 'draft' then raise exception 'Only a draft version can receive steps'; end if; if btrim(coalesce(_title,'')) = '' then raise exception 'Step title is required'; end if; if coalesce(_start_offset_minutes,-1) < 0 then raise exception 'Start offset must be zero or greater'; end if; if _duration_minutes is not null and _duration_minutes <= 0 then raise exception 'Duration must be positive'; end if;
  _pop := coalesce(_presence_population, 'participants'); _req := coalesce(_presence_requirement, app_private.w04_default_presence_requirement(_step_kind)); perform app_private.w04_assert_presence_contract(_step_kind, _req, _pop);
  _seq := coalesce(_sequence, (select coalesce(max(s.sequence),0) + 10 from public.journey_blueprint_steps s where s.version_id = _v.id)); if _seq <= 0 then raise exception 'Sequence must be positive'; end if; if exists (select 1 from public.journey_blueprint_steps s where s.version_id = _v.id and s.sequence = _seq) then raise exception 'Sequence % is already used in this version', _seq; end if;
  perform set_config('app.blueprint_control','on', true);
  insert into public.journey_blueprint_steps (tenant_id, version_id, sequence, title, description, step_kind, start_offset_minutes, duration_minutes, location_label, traveler_label, traveler_facing, presence_requirement, presence_population) values (_v.tenant_id, _v.id, _seq, btrim(_title), nullif(btrim(coalesce(_description,'')),''), _step_kind, _start_offset_minutes, _duration_minutes, nullif(btrim(coalesce(_location_label,'')),''), nullif(btrim(coalesce(_traveler_label,'')),''), coalesce(_traveler_facing,false), _presence_requirement, _pop) returning * into _row;
  update public.journey_blueprint_versions set step_count = (select count(*) from public.journey_blueprint_steps s where s.version_id = _v.id) where id = _v.id; perform set_config('app.blueprint_control','off', true);
  perform app_private.record_audit_event(_v.tenant_id, auth.uid(), 'journey_blueprint_step.added', 'journey_blueprint_step', _row.id, _key, jsonb_build_object('version_id', _v.id, 'sequence', _seq, 'kind', _step_kind));
  _existing := jsonb_build_object('blueprint_step_id', _row.id, 'sequence', _seq); insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result) values (_v.tenant_id, auth.uid(), 'blueprint.step_add', _key, _existing); return _existing;
end;
$$;

create or replace function public.update_blueprint_step(_step_id uuid, _idempotency_key text, _title text default null, _step_kind journey_step_kind default null, _start_offset_minutes integer default null, _duration_minutes integer default null, _clear_duration boolean default false, _description text default null, _location_label text default null, _traveler_label text default null, _traveler_facing boolean default null, _presence_requirement step_presence_requirement default null, _clear_presence_requirement boolean default false, _presence_population step_presence_population default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _row public.journey_blueprint_steps; _v public.journey_blueprint_versions; _kind public.journey_step_kind; _req public.step_presence_requirement; _pop public.step_presence_population; _stored public.step_presence_requirement; _offset int; _dur int;
begin
  select * into _row from public.journey_blueprint_steps s where s.id = _step_id; if _row.id is null then raise exception 'Blueprint step not found'; end if; _v := app_private.blueprint_version_ctx(_row.version_id, array['owner','admin','operations_agent']); if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k where k.actor_profile_id = auth.uid() and k.action = 'blueprint.step_update' and k.idempotency_key = _key; if _existing is not null then return _existing; end if; if _v.status <> 'draft' then raise exception 'Only steps of a draft version can be changed'; end if;
  _kind := coalesce(_step_kind, _row.step_kind); _stored := case when _clear_presence_requirement then null else coalesce(_presence_requirement, _row.presence_requirement) end; _pop := coalesce(_presence_population, _row.presence_population); _req := coalesce(_stored, app_private.w04_default_presence_requirement(_kind)); perform app_private.w04_assert_presence_contract(_kind, _req, _pop);
  _offset := coalesce(_start_offset_minutes, _row.start_offset_minutes); if _offset < 0 then raise exception 'Start offset must be zero or greater'; end if; _dur := case when _clear_duration then null else coalesce(_duration_minutes, _row.duration_minutes) end; if _dur is not null and _dur <= 0 then raise exception 'Duration must be positive'; end if; if _title is not null and btrim(_title) = '' then raise exception 'Step title cannot be empty'; end if;
  perform set_config('app.blueprint_control','on', true);
  update public.journey_blueprint_steps s set title = coalesce(nullif(btrim(coalesce(_title,'')),''), s.title), step_kind = _kind, start_offset_minutes = _offset, duration_minutes = _dur, description = case when _description is null then s.description else nullif(btrim(_description),'') end, location_label = case when _location_label is null then s.location_label else nullif(btrim(_location_label),'') end, traveler_label = case when _traveler_label is null then s.traveler_label else nullif(btrim(_traveler_label),'') end, traveler_facing = coalesce(_traveler_facing, s.traveler_facing), presence_requirement = _stored, presence_population = _pop where s.id = _row.id returning * into _row;
  perform set_config('app.blueprint_control','off', true);
  perform app_private.record_audit_event(_v.tenant_id, auth.uid(), 'journey_blueprint_step.updated', 'journey_blueprint_step', _row.id, _key, jsonb_build_object('version_id', _v.id, 'sequence', _row.sequence, 'kind', _kind));
  _existing := jsonb_build_object('blueprint_step_id', _row.id, 'sequence', _row.sequence); insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result) values (_v.tenant_id, auth.uid(), 'blueprint.step_update', _key, _existing); return _existing;
end;
$$;

create or replace function public.remove_blueprint_step(_step_id uuid, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _row public.journey_blueprint_steps; _v public.journey_blueprint_versions;
begin
  select * into _row from public.journey_blueprint_steps s where s.id = _step_id; if _row.id is null then raise exception 'Blueprint step not found'; end if; _v := app_private.blueprint_version_ctx(_row.version_id, array['owner','admin','operations_agent']); if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k where k.actor_profile_id = auth.uid() and k.action = 'blueprint.step_remove' and k.idempotency_key = _key; if _existing is not null then return _existing; end if; if _v.status <> 'draft' then raise exception 'Only steps of a draft version can be removed'; end if;
  perform set_config('app.blueprint_control','on', true); delete from public.journey_blueprint_steps s where s.id = _row.id; update public.journey_blueprint_versions set step_count = (select count(*) from public.journey_blueprint_steps s where s.version_id = _v.id) where id = _v.id; perform set_config('app.blueprint_control','off', true);
  perform app_private.record_audit_event(_v.tenant_id, auth.uid(), 'journey_blueprint_step.removed', 'journey_blueprint_step', _row.id, _key, jsonb_build_object('version_id', _v.id, 'sequence', _row.sequence)); _existing := jsonb_build_object('blueprint_step_id', _row.id, 'removed', true); insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result) values (_v.tenant_id, auth.uid(), 'blueprint.step_remove', _key, _existing); return _existing;
end;
$$;
