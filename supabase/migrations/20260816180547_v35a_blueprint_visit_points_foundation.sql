create table public.journey_blueprint_visit_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  version_id uuid not null references public.journey_blueprint_versions(id) on delete cascade,
  blueprint_step_id uuid not null references public.journey_blueprint_steps(id) on delete cascade,
  sequence integer not null,
  title text not null,
  interpretation text,
  guide_tip text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_blueprint_visit_points_sequence_positive check (sequence > 0),
  constraint journey_blueprint_visit_points_title_present check (btrim(title) <> ''),
  constraint journey_blueprint_visit_points_step_sequence_unique unique (blueprint_step_id, sequence)
);
create index journey_blueprint_visit_points_version_idx on public.journey_blueprint_visit_points(version_id, blueprint_step_id, sequence);
create index journey_blueprint_visit_points_tenant_idx on public.journey_blueprint_visit_points(tenant_id);
alter table public.journey_blueprint_visit_points enable row level security;
create policy "Members read blueprint visit points" on public.journey_blueprint_visit_points for select to authenticated using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent','member']::public.app_role[]));
revoke all on table public.journey_blueprint_visit_points from anon, authenticated;
grant select on table public.journey_blueprint_visit_points to authenticated;
create trigger journey_blueprint_visit_points_updated_at before update on public.journey_blueprint_visit_points for each row execute function public.set_updated_at();
create trigger journey_blueprint_visit_points_guard before insert or update or delete on public.journey_blueprint_visit_points for each row execute function public.guard_blueprint_mutation();
create or replace function public.guard_blueprint_visit_point_immutability() returns trigger language plpgsql set search_path to 'pg_catalog', 'public' as $function$
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
end;$function$;
create trigger journey_blueprint_visit_points_immutability before insert or update or delete on public.journey_blueprint_visit_points for each row execute function public.guard_blueprint_visit_point_immutability();
create or replace function public.add_blueprint_visit_point(_blueprint_step_id uuid,_title text,_idempotency_key text,_interpretation text default null,_guide_tip text default null) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $function$
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
end;$function$;
create or replace function public.update_blueprint_visit_point(_visit_point_id uuid,_title text,_idempotency_key text,_interpretation text default null,_guide_tip text default null) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $function$
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
end;$function$;
create or replace function public.remove_blueprint_visit_point(_visit_point_id uuid,_idempotency_key text) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $function$
declare _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb; _row public.journey_blueprint_visit_points; _version public.journey_blueprint_versions;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if; if _key is null then raise exception 'Idempotency key is required'; end if;
 select * into _row from public.journey_blueprint_visit_points where id=_visit_point_id; if _row.id is null then raise exception 'Blueprint visit point not found'; end if;
 _version:=app_private.blueprint_version_ctx(_row.version_id,array['owner','admin','operations_agent']); if _version.status<>'draft' then raise exception 'Only a draft version can remove visit points'; end if;
 select k.result into _existing from public.idempotency_keys k where k.actor_profile_id=auth.uid() and k.action='blueprint.visit_point_remove' and k.idempotency_key=_key; if _existing is not null then return _existing; end if;
 perform set_config('app.blueprint_control','on',true); delete from public.journey_blueprint_visit_points where id=_row.id; perform set_config('app.blueprint_control','off',true);
 _existing:=jsonb_build_object('blueprint_visit_point_id',_row.id,'removed',true); perform app_private.record_audit_event(_version.tenant_id,auth.uid(),'journey_blueprint_visit_point.removed','journey_blueprint_visit_point',_row.id,_key,jsonb_build_object('version_id',_version.id,'blueprint_step_id',_row.blueprint_step_id));
 insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result) values(_version.tenant_id,auth.uid(),'blueprint.visit_point_remove',_key,_existing); return _existing;
end;$function$;
create or replace function public.reorder_blueprint_visit_points(_blueprint_step_id uuid,_ordered_visit_point_ids uuid[],_idempotency_key text) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $function$
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
end;$function$;
create or replace function app_private.blueprint_checksum(_version_id uuid) returns text language sql stable security definer set search_path to 'pg_catalog','public' as $function$
 with canonical as (
  select s.sequence step_sequence,0 point_sequence,concat_ws('|','STEP',s.sequence::text,btrim(s.title),s.step_kind::text,s.start_offset_minutes::text,coalesce(s.duration_minutes::text,'-'),coalesce(btrim(s.description),''),coalesce(btrim(s.location_label),''),coalesce(btrim(s.traveler_label),''),s.traveler_facing::text,coalesce(s.presence_requirement::text,'default'),s.presence_population::text) line from public.journey_blueprint_steps s where s.version_id=_version_id
  union all
  select s.sequence,p.sequence,concat_ws('|','POINT',s.sequence::text,p.sequence::text,btrim(p.title),coalesce(btrim(p.interpretation),''),coalesce(btrim(p.guide_tip),'')) from public.journey_blueprint_visit_points p join public.journey_blueprint_steps s on s.id=p.blueprint_step_id where p.version_id=_version_id
 ) select md5(coalesce(string_agg(line,E'\n' order by step_sequence,point_sequence),'')) from canonical
$function$;
revoke all on function public.add_blueprint_visit_point(uuid,text,text,text,text) from public,anon;
revoke all on function public.update_blueprint_visit_point(uuid,text,text,text,text) from public,anon;
revoke all on function public.remove_blueprint_visit_point(uuid,text) from public,anon;
revoke all on function public.reorder_blueprint_visit_points(uuid,uuid[],text) from public,anon;
grant execute on function public.add_blueprint_visit_point(uuid,text,text,text,text) to authenticated;
grant execute on function public.update_blueprint_visit_point(uuid,text,text,text,text) to authenticated;
grant execute on function public.remove_blueprint_visit_point(uuid,text) to authenticated;
grant execute on function public.reorder_blueprint_visit_points(uuid,uuid[],text) to authenticated;