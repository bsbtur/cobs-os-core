-- POST_PILOT_RELEASE_02 — canonical presence contract (functional only)

CREATE OR REPLACE FUNCTION app_private.w04_default_presence_requirement(_kind journey_step_kind)
 RETURNS step_presence_requirement
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case
    when _kind = 'boarding' then 'boarded'
    when _kind in ('meeting','disembarkation') then 'accounted'
    else 'none' end::public.step_presence_requirement
$function$;

CREATE OR REPLACE FUNCTION app_private.w04_assert_presence_contract(
  _step_kind journey_step_kind,
  _presence_requirement step_presence_requirement,
  _presence_population step_presence_population DEFAULT 'participants'::step_presence_population
)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _allowed text;
begin
  _allowed := case
    when _step_kind = 'meeting' then 'accounted'
    when _step_kind = 'boarding' then 'boarded'
    when _step_kind in ('arrival','activity') then 'none, accounted'
    when _step_kind = 'disembarkation' then 'accounted'
    else 'none'
  end;

  if _presence_requirement is null then
    raise exception 'Presence requirement is required for step kind "%" (expected: %)', _step_kind, _allowed;
  end if;

  if _presence_requirement = 'boarded' and _step_kind <> 'boarding' then
    raise exception 'Presence contract violation: step kind "%" received requirement "boarded"; boarding confirmation belongs to boarding steps only (expected: %)',
      _step_kind, _allowed;
  end if;

  if position(_presence_requirement::text in _allowed) = 0 then
    raise exception 'Presence contract violation: step kind "%" received requirement "%"; expected: %',
      _step_kind, _presence_requirement, _allowed;
  end if;

  if _presence_requirement = 'none' and coalesce(_presence_population,'participants') <> 'participants' then
    raise exception 'Presence contract violation: step kind "%" has no presence requirement, so the population must stay "participants"', _step_kind;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_journey_step(_operation_id uuid, _title text, _step_kind journey_step_kind, _idempotency_key text, _description text DEFAULT NULL::text, _planned_start timestamp with time zone DEFAULT NULL::timestamp with time zone, _planned_end timestamp with time zone DEFAULT NULL::timestamp with time zone, _location_label text DEFAULT NULL::text, _traveler_label text DEFAULT NULL::text, _traveler_facing boolean DEFAULT false, _presence_requirement step_presence_requirement DEFAULT NULL::step_presence_requirement, _presence_population step_presence_population DEFAULT 'participants'::step_presence_population)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _op public.operations; _row public.journey_steps; _seq int; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _existing jsonb;
  _req public.step_presence_requirement; _pop public.step_presence_population;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _op.status not in ('draft','planning') then
    raise exception 'Planned steps can only be added while the operation is still being planned. Use an ad-hoc step instead.';
  end if;
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'journey.step_create' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));

  _req := coalesce(_presence_requirement, app_private.w04_default_presence_requirement(_step_kind));
  _pop := coalesce(_presence_population, 'participants');
  perform app_private.w04_assert_presence_contract(_step_kind, _req, _pop);

  select coalesce(max(s.sequence), 0) + 10 into _seq from public.journey_steps s where s.operation_id = _op.id;

  perform set_config('app.w04_control','on', true);
  insert into public.journey_steps (tenant_id, operation_id, sequence, title, description, step_kind,
    plan_origin, planned_start, planned_end, location_label, traveler_label, traveler_facing,
    presence_requirement, presence_population, created_by)
  values (_op.tenant_id, _op.id, _seq, btrim(_title), nullif(btrim(coalesce(_description,'')),''), _step_kind,
    'planned', _planned_start, _planned_end, nullif(btrim(coalesce(_location_label,'')),''),
    nullif(btrim(coalesce(_traveler_label,'')),''), coalesce(_traveler_facing,false),
    _req, _pop, auth.uid())
  returning * into _row;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'journey.step_created',
    'journey_step', _row.id, _key,
    jsonb_build_object('operation_id', _op.id, 'sequence', _seq, 'kind', _step_kind, 'plan_origin','planned'));

  _existing := jsonb_build_object('journey_step_id', _row.id, 'sequence', _seq);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, auth.uid(), 'journey.step_create', _key, _existing);
  return _existing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_ad_hoc_journey_step(_operation_id uuid, _title text, _step_kind journey_step_kind, _reason text, _idempotency_key text, _description text DEFAULT NULL::text, _expected_start timestamp with time zone DEFAULT NULL::timestamp with time zone, _expected_end timestamp with time zone DEFAULT NULL::timestamp with time zone, _location_label text DEFAULT NULL::text, _traveler_label text DEFAULT NULL::text, _traveler_facing boolean DEFAULT false, _presence_requirement step_presence_requirement DEFAULT NULL::step_presence_requirement, _presence_population step_presence_population DEFAULT 'participants'::step_presence_population)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _op public.operations; _row public.journey_steps; _seq int;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _existing jsonb;
  _req public.step_presence_requirement; _pop public.step_presence_population;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _why is null then raise exception 'A reason is required to add a step during the operation'; end if;
  if _op.status in ('completed','cancelled') then
    raise exception 'A % operation no longer accepts new steps', _op.status;
  end if;
  perform app_private.assert_generic_note(_why);
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid() and k.action = 'journey.step_create_ad_hoc' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  _req := coalesce(_presence_requirement, app_private.w04_default_presence_requirement(_step_kind));
  _pop := coalesce(_presence_population, 'participants');
  perform app_private.w04_assert_presence_contract(_step_kind, _req, _pop);

  select coalesce(max(s.sequence), 0) + 10 into _seq from public.journey_steps s where s.operation_id = _op.id;

  perform set_config('app.w04_control','on', true);
  insert into public.journey_steps (tenant_id, operation_id, sequence, title, description, step_kind,
    plan_origin, ad_hoc_reason, planned_start, planned_end, expected_start, expected_end,
    location_label, traveler_label, traveler_facing, presence_requirement, presence_population, created_by)
  values (_op.tenant_id, _op.id, _seq, btrim(_title), nullif(btrim(coalesce(_description,'')),''), _step_kind,
    'ad_hoc', _why, null, null, _expected_start, _expected_end,
    nullif(btrim(coalesce(_location_label,'')),''), nullif(btrim(coalesce(_traveler_label,'')),''),
    coalesce(_traveler_facing,false), _req, _pop, auth.uid())
  returning * into _row;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'journey.step_created_ad_hoc',
    'journey_step', _row.id, _key,
    jsonb_build_object('operation_id', _op.id, 'sequence', _seq, 'kind', _step_kind,
                       'reason', _why, 'operation_status', _op.status));

  _existing := jsonb_build_object('journey_step_id', _row.id, 'sequence', _seq, 'plan_origin','ad_hoc');
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, auth.uid(), 'journey.step_create_ad_hoc', _key, _existing);
  return _existing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_journey_step(_journey_step_id uuid, _title text DEFAULT NULL::text, _description text DEFAULT NULL::text, _location_label text DEFAULT NULL::text, _traveler_label text DEFAULT NULL::text, _traveler_facing boolean DEFAULT NULL::boolean, _planned_start timestamp with time zone DEFAULT NULL::timestamp with time zone, _planned_end timestamp with time zone DEFAULT NULL::timestamp with time zone, _presence_requirement step_presence_requirement DEFAULT NULL::step_presence_requirement, _presence_population step_presence_population DEFAULT NULL::step_presence_population, _apply_planned boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _step public.journey_steps; _op public.operations;
  _req public.step_presence_requirement; _pop public.step_presence_population;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));

  _req := coalesce(_presence_requirement, _step.presence_requirement);
  _pop := coalesce(_presence_population, _step.presence_population);
  if _presence_requirement is not null or _presence_population is not null then
    perform app_private.w04_assert_presence_contract(_step.step_kind, _req, _pop);
  end if;

  perform set_config('app.w04_control','on', true);
  update public.journey_steps set
    title = coalesce(nullif(btrim(coalesce(_title,'')),''), title),
    description = case when _description is null then description else nullif(btrim(_description),'') end,
    location_label = case when _location_label is null then location_label else nullif(btrim(_location_label),'') end,
    traveler_label = case when _traveler_label is null then traveler_label else nullif(btrim(_traveler_label),'') end,
    traveler_facing = coalesce(_traveler_facing, traveler_facing),
    presence_requirement = _req,
    presence_population = _pop,
    planned_start = case when _apply_planned and plan_origin = 'planned' then _planned_start else planned_start end,
    planned_end = case when _apply_planned and plan_origin = 'planned' then _planned_end else planned_end end
  where id = _step.id;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(_step.tenant_id, auth.uid(), 'journey.step_updated',
    'journey_step', _step.id, null,
    jsonb_build_object('operation_id', _step.operation_id, 'operation_status', _op.status,
                       'planned_changed', coalesce(_apply_planned,false)));
  return jsonb_build_object('journey_step_id', _step.id);
end;
$function$;