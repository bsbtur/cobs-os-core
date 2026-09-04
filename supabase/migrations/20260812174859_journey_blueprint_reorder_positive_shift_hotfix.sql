create or replace function public.reorder_blueprint_steps(
  _version_id uuid, _ordered_step_ids uuid[], _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _v public.journey_blueprint_versions; _total int; _given int; _i int; _shift int;
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

  select coalesce(max(s.sequence),0) + 1000 into _shift
    from public.journey_blueprint_steps s where s.version_id = _v.id;

  perform set_config('app.blueprint_control','on', true);
  update public.journey_blueprint_steps s set sequence = s.sequence + _shift where s.version_id = _v.id;
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