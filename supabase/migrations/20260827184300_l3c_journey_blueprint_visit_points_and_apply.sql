-- L3-C Journey canonical parity recovery.
-- Scope: Blueprint visit points, validation/publish/archive and apply-to-operation.

create or replace function public.add_blueprint_visit_point(_blueprint_step_id uuid, _title text, _idempotency_key text, _interpretation text default null, _guide_tip text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key, '')), ''); _existing jsonb; _step public.journey_blueprint_steps; _version public.journey_blueprint_versions; _row public.journey_blueprint_visit_points; _sequence integer; _title_clean text := nullif(btrim(coalesce(_title, '')), '');
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if; if _key is null then raise exception 'Idempotency key is required'; end if; if _title_clean is null then raise exception 'Visit point title is required'; end if;
 select * into _step from public.journey_blueprint_steps where id = _blueprint_step_id; if _step.id is null then raise exception 'Blueprint step not found'; end if;
 _version := app_private.blueprint_version_ctx(_step.version_id,array['owner','admin','operations_agent']); if _version.status <> 'draft' then raise exception 'Only a draft version can receive visit points'; end if;
 perform app_private.assert_generic_note(nullif(btrim(coalesce(_interpretation, '')), '')); perform app_private.assert_generic_note(nullif(btrim(coalesce(_guide_tip, '')), ''));
 select k.result into _existing from public.idempotency_keys k where k.actor_profile_id=auth.uid() and k.action='blueprint.visit_point_add' and k.idempotency_key=_key; if _existing is not null then return _existing; end if;
 select coalesce(max(sequence),0)+10 into _sequence from public.journey_blueprint_visit_points where blueprint_step_id=_step.id;
 perform set_config('app.blueprint_control','on',true);
 insert into public.journey_blueprint_visit_points(tenant_id,version_id,blueprint_step_id,sequence,title,interpretation,guide_tip,created_by) values(_version.tenant_id,_version.id,_step.id,_sequence,_title_clean,nullif(btrim(coalesce(_interpretation,'')),''),nullif(btrim(coalesce(_guide_tip,'')),''),auth.uid()) returning * into _row;
 perform set_config('app.blueprint_control','off',true);
 _existing:=jsonb_build_object('blueprint_visit_point_id',_row.id,'sequence',_row.sequence);
 perform app_private.record_audit_event(_version.tenant_id,auth.uid(),'journey_blueprint_visit_point.added','journey_blueprint_visit_point',_row.id,_key,jsonb_build_object('version_id',_version.id,'blueprint_step_id',_step.id,'sequence',_row.sequence));
 insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result) values(_version.tenant_id,auth.uid(),'blueprint.visit_point_add',_key,_existing); return _existing;
end;
$$;

create or replace function public.update_blueprint_visit_point(_visit_point_id uuid, _title text, _idempotency_key text, _interpretation text default null, _guide_tip text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _row public.journey_blueprint_visit_points; _version public.journey_blueprint_versions; _title_clean text:=nullif(btrim(coalesce(_title,'')),'');
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if; if _key is null then raise exception 'Idempotency key is required'; end if; if _title_clean is null then raise exception 'Visit point title is required'; end if;
 select * into _row from public.journey_blueprint_visit_points where id=_visit_point_id; if _row.id is null then raise exception 'Blueprint visit point not found'; end if;
 _version:=app_private.blueprint_version_ctx(_row.version_id,array['owner','admin','operations_agent']); if _version.status<>'draft' then raise exception 'Only a draft version can change visit points'; end if;
 perform app_private.assert_generic_note(nullif(btrim(coalesce(_interpretation,'')),'')); perform app_private.assert_generic_note(nullif(btrim(coalesce(_guide_tip,'')),''));
 select k.result into _existing from public.idempotency_keys k where k.actor_profile_id=auth.uid() and k.action='blueprint.visit_point_update' and k.idempotency_key=_key; if _existing is not null then return _existing; end if;
 perform set_config('app.blueprint_control','on',true); update public.journey_blueprint_visit_points set title=_title_clean,interpretation=nullif(btrim(coalesce(_interpretation,'')),''),guide_tip=nullif(btrim(coalesce(_guide_tip,'')),'') where id=_row.id returning * into _row; perform set_config('app.blueprint_control','off',true);
 _existing:=jsonb_build_object('blueprint_visit_point_id',_row.id); perform app_private.record_audit_event(_version.tenant_id,auth.uid(),'journey_blueprint_visit_point.updated','journey_blueprint_visit_point',_row.id,_key,jsonb_build_object('version_id',_version.id,'blueprint_step_id',_row.blueprint_step_id));
 insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result) values(_version.tenant_id,auth.uid(),'blueprint.visit_point_update',_key,_existing); return _existing;
end;
$$;

create or replace function public.remove_blueprint_visit_point(_visit_point_id uuid, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _row public.journey_blueprint_visit_points; _version public.journey_blueprint_versions;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if; if _key is null then raise exception 'Idempotency key is required'; end if;
 select * into _row from public.journey_blueprint_visit_points where id=_visit_point_id; if _row.id is null then raise exception 'Blueprint visit point not found'; end if;
 _version:=app_private.blueprint_version_ctx(_row.version_id,array['owner','admin','operations_agent']); if _version.status<>'draft' then raise exception 'Only a draft version can remove visit points'; end if;
 select k.result into _existing from public.idempotency_keys k where k.actor_profile_id=auth.uid() and k.action='blueprint.visit_point_remove' and k.idempotency_key=_key; if _existing is not null then return _existing; end if;
 perform set_config('app.blueprint_control','on',true); delete from public.journey_blueprint_visit_points where id=_row.id; perform set_config('app.blueprint_control','off',true);
 _existing:=jsonb_build_object('blueprint_visit_point_id',_row.id,'removed',true); perform app_private.record_audit_event(_version.tenant_id,auth.uid(),'journey_blueprint_visit_point.removed','journey_blueprint_visit_point',_row.id,_key,jsonb_build_object('version_id',_version.id,'blueprint_step_id',_row.blueprint_step_id));
 insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result) values(_version.tenant_id,auth.uid(),'blueprint.visit_point_remove',_key,_existing); return _existing;
end;
$$;

create or replace function public.reorder_blueprint_visit_points(_blueprint_step_id uuid, _ordered_visit_point_ids uuid[], _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _step public.journey_blueprint_steps; _version public.journey_blueprint_versions; _total integer; _given integer; _shift integer; _i integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if; if _key is null then raise exception 'Idempotency key is required'; end if;
 select * into _step from public.journey_blueprint_steps where id=_blueprint_step_id; if _step.id is null then raise exception 'Blueprint step not found'; end if; _version:=app_private.blueprint_version_ctx(_step.version_id,array['owner','admin','operations_agent']); if _version.status<>'draft' then raise exception 'Only a draft version can reorder visit points'; end if;
 select k.result into _existing from public.idempotency_keys k where k.actor_profile_id=auth.uid() and k.action='blueprint.visit_point_reorder' and k.idempotency_key=_key; if _existing is not null then return _existing; end if;
 select count(*) into _total from public.journey_blueprint_visit_points where blueprint_step_id=_step.id; select count(distinct x) into _given from unnest(coalesce(_ordered_visit_point_ids,'{}'::uuid[])) x;
 if _given<>coalesce(array_length(_ordered_visit_point_ids,1),0) then raise exception 'Visit point list contains duplicates'; end if; if _given<>_total then raise exception 'Ordered list must contain every visit point exactly once'; end if;
 if exists(select 1 from unnest(_ordered_visit_point_ids) x where not exists(select 1 from public.journey_blueprint_visit_points p where p.id=x and p.blueprint_step_id=_step.id)) then raise exception 'Ordered list contains a visit point from another step'; end if;
 if _total>0 then select coalesce(max(sequence),0)+1000 into _shift from public.journey_blueprint_visit_points where blueprint_step_id=_step.id; perform set_config('app.blueprint_control','on',true); update public.journey_blueprint_visit_points set sequence=sequence+_shift where blueprint_step_id=_step.id; for _i in 1..array_length(_ordered_visit_point_ids,1) loop update public.journey_blueprint_visit_points set sequence=_i*10 where id=_ordered_visit_point_ids[_i]; end loop; perform set_config('app.blueprint_control','off',true); end if;
 _existing:=jsonb_build_object('blueprint_step_id',_step.id,'visit_point_count',_total); perform app_private.record_audit_event(_version.tenant_id,auth.uid(),'journey_blueprint_visit_point.reordered','journey_blueprint_step',_step.id,_key,jsonb_build_object('visit_point_count',_total)); insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result) values(_version.tenant_id,auth.uid(),'blueprint.visit_point_reorder',_key,_existing); return _existing;
end;
$$;

create or replace function public.validate_blueprint_version(_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare _v public.journey_blueprint_versions; _b public.journey_blueprints; _violations jsonb := '[]'::jsonb; _s record; _prev_offset int := null; _req public.step_presence_requirement; _count int;
begin
  _v := app_private.blueprint_version_ctx(_version_id, array['owner','admin','operations_agent','member']); select * into _b from public.journey_blueprints b where b.id = _v.blueprint_id;
  if _b.status <> 'active' then _violations := _violations || jsonb_build_object('code','blueprint_archived','message','The blueprint is archived'); end if;
  if _b.tenant_id <> _v.tenant_id then _violations := _violations || jsonb_build_object('code','tenant_mismatch','message','Version and blueprint belong to different organisations'); end if;
  select count(*) into _count from public.journey_blueprint_steps s where s.version_id = _v.id; if _count = 0 then _violations := _violations || jsonb_build_object('code','no_steps','message','A version needs at least one step'); end if;
  for _s in select * from public.journey_blueprint_steps s where s.version_id = _v.id order by s.sequence loop
    if _s.tenant_id <> _v.tenant_id then _violations := _violations || jsonb_build_object('code','tenant_mismatch','sequence',_s.sequence,'message','Step belongs to another organisation'); end if;
    if btrim(coalesce(_s.title,'')) = '' then _violations := _violations || jsonb_build_object('code','empty_title','sequence',_s.sequence,'message','Step title is empty'); end if;
    if _s.sequence <= 0 then _violations := _violations || jsonb_build_object('code','invalid_sequence','sequence',_s.sequence,'message','Sequence must be positive'); end if;
    if _s.start_offset_minutes < 0 then _violations := _violations || jsonb_build_object('code','invalid_offset','sequence',_s.sequence,'message','Offset cannot be negative'); end if;
    if _prev_offset is not null and _s.start_offset_minutes < _prev_offset then _violations := _violations || jsonb_build_object('code','offset_not_monotonic','sequence',_s.sequence,'message','Offsets must not decrease along the sequence'); end if;
    _prev_offset := _s.start_offset_minutes;
    if _s.duration_minutes is not null and _s.duration_minutes <= 0 then _violations := _violations || jsonb_build_object('code','invalid_duration','sequence',_s.sequence,'message','Duration must be positive'); end if;
    _req := coalesce(_s.presence_requirement, app_private.w04_default_presence_requirement(_s.step_kind));
    begin perform app_private.w04_assert_presence_contract(_s.step_kind, _req, _s.presence_population); exception when others then _violations := _violations || jsonb_build_object('code','presence_contract','sequence',_s.sequence,'message',sqlerrm); end;
  end loop;
  return jsonb_build_object('version_id', _v.id, 'status', _v.status, 'step_count', _count, 'valid', jsonb_array_length(_violations) = 0, 'violations', _violations);
end;
$$;

create or replace function public.publish_blueprint_version(_version_id uuid, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _v public.journey_blueprint_versions; _report jsonb; _checksum text; _count int;
begin
  _v := app_private.blueprint_version_ctx(_version_id, array['owner','admin']); if _key is null then raise exception 'Idempotency key is required'; end if;
  select k.result into _existing from public.idempotency_keys k where k.actor_profile_id = auth.uid() and k.action = 'blueprint.version_publish' and k.idempotency_key = _key; if _existing is not null then return _existing; end if; if _v.status <> 'draft' then raise exception 'Only a draft version can be published'; end if;
  _report := public.validate_blueprint_version(_v.id); if not (_report->>'valid')::boolean then raise exception 'This version cannot be published: %', _report->'violations'; end if;
  _checksum := app_private.blueprint_checksum(_v.id); select count(*) into _count from public.journey_blueprint_steps s where s.version_id = _v.id;
  perform set_config('app.blueprint_control','on', true); update public.journey_blueprint_versions v set status = 'published', published_at = now(), published_by = auth.uid(), checksum = _checksum, step_count = _count where v.id = _v.id; perform set_config('app.blueprint_control','off', true);
  perform app_private.record_audit_event(_v.tenant_id, auth.uid(), 'journey_blueprint_version.published', 'journey_blueprint_version', _v.id, _key, jsonb_build_object('blueprint_id', _v.blueprint_id, 'version_number', _v.version_number, 'checksum', _checksum, 'step_count', _count));
  _existing := jsonb_build_object('version_id', _v.id, 'version_number', _v.version_number, 'checksum', _checksum, 'step_count', _count); insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result) values (_v.tenant_id, auth.uid(), 'blueprint.version_publish', _key, _existing); return _existing;
end;
$$;

create or replace function public.archive_journey_blueprint(_blueprint_id uuid, _reason text, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _b public.journey_blueprints; _r text := nullif(btrim(coalesce(_reason,'')),'');
begin
  select * into _b from public.journey_blueprints b where b.id = _blueprint_id; if _b.id is null then raise exception 'Blueprint not found'; end if; perform app_private.blueprint_require_role(_b.tenant_id, array['owner','admin']); if _key is null then raise exception 'Idempotency key is required'; end if; if _r is null then raise exception 'An archive reason is required'; end if;
  select k.result into _existing from public.idempotency_keys k where k.actor_profile_id = auth.uid() and k.action = 'blueprint.archive' and k.idempotency_key = _key; if _existing is not null then return _existing; end if; if _b.status <> 'active' then raise exception 'This blueprint is already archived'; end if;
  perform set_config('app.blueprint_control','on', true); update public.journey_blueprints b set status = 'archived', metadata = b.metadata || jsonb_build_object('archive_reason', _r) where b.id = _b.id; perform set_config('app.blueprint_control','off', true);
  perform app_private.record_audit_event(_b.tenant_id, auth.uid(), 'journey_blueprint.archived', 'journey_blueprint', _b.id, _key, jsonb_build_object('reason', _r));
  _existing := jsonb_build_object('blueprint_id', _b.id, 'status', 'archived'); insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result) values (_b.tenant_id, auth.uid(), 'blueprint.archive', _key, _existing); return _existing;
end;
$$;

create or replace function public.apply_journey_blueprint_to_operation(_operation_id uuid, _version_id uuid, _idempotency_key text, _anchor_start timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _op public.operations; _v public.journey_blueprint_versions; _b public.journey_blueprints; _anchor timestamptz; _s record; _req public.step_presence_requirement; _steps jsonb:='[]'::jsonb; _new public.journey_steps; _report jsonb; _count int; _inserted_points int; _visit_point_count int:=0;
begin
 _op:=app_private.w04_operation(_operation_id,array['owner','admin','operations_agent']); if _key is null then raise exception 'Idempotency key is required'; end if;
 select k.result into _existing from public.idempotency_keys k where k.actor_profile_id=auth.uid() and k.action='journey.blueprint_apply' and k.idempotency_key=_key; if _existing is not null then return _existing; end if;
 select * into _v from public.journey_blueprint_versions v where v.id=_version_id; if _v.id is null then raise exception 'Blueprint version not found'; end if; select * into _b from public.journey_blueprints b where b.id=_v.blueprint_id;
 if _v.tenant_id<>_op.tenant_id or _b.tenant_id<>_op.tenant_id then raise exception 'The blueprint belongs to another organisation'; end if; if _b.status<>'active' then raise exception 'An archived blueprint cannot be applied'; end if; if _v.status<>'published' then raise exception 'Only a published version can be applied'; end if; if _op.status not in ('draft','planning') then raise exception 'A blueprint can only be applied while the operation is still being planned'; end if;
 if exists(select 1 from public.journey_steps s where s.operation_id=_op.id) then raise exception 'This operation already has journey steps'; end if; if exists(select 1 from public.operation_journey_provisionings p where p.operation_id=_op.id) then raise exception 'This operation has already been provisioned from a blueprint'; end if;
 _anchor:=coalesce(_anchor_start,_op.planned_start); if _anchor is null then raise exception 'An anchor start is required: the operation has no planned start'; end if;
 _report:=public.validate_blueprint_version(_v.id); if not (_report->>'valid')::boolean then raise exception 'This version is no longer valid: %',_report->'violations'; end if;
 perform set_config('app.w04_control','on',true); perform set_config('app.blueprint_control','on',true);
 for _s in select * from public.journey_blueprint_steps s where s.version_id=_v.id order by s.sequence loop
  _req:=coalesce(_s.presence_requirement,app_private.w04_default_presence_requirement(_s.step_kind)); perform app_private.w04_assert_presence_contract(_s.step_kind,_req,_s.presence_population);
  insert into public.journey_steps(tenant_id,operation_id,sequence,title,description,step_kind,plan_origin,planned_start,planned_end,location_label,traveler_label,traveler_facing,presence_requirement,presence_population,created_by,source_blueprint_version_id,source_blueprint_step_id) values(_op.tenant_id,_op.id,_s.sequence,_s.title,_s.description,_s.step_kind,'planned',_anchor+make_interval(mins=>_s.start_offset_minutes),case when _s.duration_minutes is null then null else _anchor+make_interval(mins=>_s.start_offset_minutes+_s.duration_minutes) end,_s.location_label,_s.traveler_label,_s.traveler_facing,_req,_s.presence_population,auth.uid(),_v.id,_s.id) returning * into _new;
  insert into public.journey_visit_points(tenant_id,operation_id,journey_step_id,sequence,title,interpretation,guide_tip,metadata,created_by) select _op.tenant_id,_op.id,_new.id,p.sequence,p.title,p.interpretation,p.guide_tip,coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object('source_blueprint_visit_point_id',p.id,'source_blueprint_version_id',_v.id),auth.uid() from public.journey_blueprint_visit_points p where p.blueprint_step_id=_s.id order by p.sequence;
  get diagnostics _inserted_points = row_count; _visit_point_count:=_visit_point_count+_inserted_points;
  _steps:=_steps||jsonb_build_object('journey_step_id',_new.id,'sequence',_new.sequence,'title',_new.title,'step_kind',_new.step_kind,'planned_start',_new.planned_start,'planned_end',_new.planned_end,'presence_requirement',_new.presence_requirement,'source_blueprint_step_id',_s.id,'visit_point_count',_inserted_points);
 end loop;
 insert into public.operation_journey_provisionings(tenant_id,operation_id,blueprint_id,blueprint_version_id,version_checksum,applied_by,idempotency_key) values(_op.tenant_id,_op.id,_b.id,_v.id,coalesce(_v.checksum,''),auth.uid(),_key); perform set_config('app.blueprint_control','off',true); perform set_config('app.w04_control','off',true);
 _count:=jsonb_array_length(_steps); perform app_private.record_audit_event(_op.tenant_id,auth.uid(),'operation.journey_provisioned','operation',_op.id,_key,jsonb_build_object('blueprint_id',_b.id,'version_id',_v.id,'version_number',_v.version_number,'checksum',_v.checksum,'step_count',_count,'visit_point_count',_visit_point_count,'operation_id',_op.id,'anchor_start',_anchor));
 _existing:=jsonb_build_object('operation_id',_op.id,'blueprint_id',_b.id,'version_id',_v.id,'version_number',_v.version_number,'checksum',_v.checksum,'anchor_start',_anchor,'step_count',_count,'visit_point_count',_visit_point_count,'steps',_steps); insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result) values(_op.tenant_id,auth.uid(),'journey.blueprint_apply',_key,_existing); return _existing;
end;
$$;
