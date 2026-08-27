-- L3-C Journey canonical parity recovery.
-- Scope: Journey editing, traveler read models, departure authorization, presence correction and forecast helper.

create or replace function public.update_journey_step(_journey_step_id uuid, _title text default null, _description text default null, _location_label text default null, _traveler_label text default null, _traveler_facing boolean default null, _planned_start timestamptz default null, _planned_end timestamptz default null, _presence_requirement step_presence_requirement default null, _presence_population step_presence_population default null, _apply_planned boolean default false)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations; _req public.step_presence_requirement; _pop public.step_presence_population;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']); select * into _op from public.operations o where o.id = _step.operation_id; perform app_private.assert_operation_not_closed(_step.operation_id); perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));
  _req := coalesce(_presence_requirement, _step.presence_requirement); _pop := coalesce(_presence_population, _step.presence_population); if _presence_requirement is not null or _presence_population is not null then perform app_private.w04_assert_presence_contract(_step.step_kind, _req, _pop); end if;
  perform set_config('app.w04_control','on', true);
  update public.journey_steps set title = coalesce(nullif(btrim(coalesce(_title,'')),''), title), description = case when _description is null then description else nullif(btrim(_description),'') end, location_label = case when _location_label is null then location_label else nullif(btrim(_location_label),'') end, traveler_label = case when _traveler_label is null then traveler_label else nullif(btrim(_traveler_label),'') end, traveler_facing = coalesce(_traveler_facing, traveler_facing), presence_requirement = _req, presence_population = _pop, planned_start = case when _apply_planned and plan_origin = 'planned' then _planned_start else planned_start end, planned_end = case when _apply_planned and plan_origin = 'planned' then _planned_end else planned_end end where id = _step.id;
  perform set_config('app.w04_control','off', true);
  perform app_private.record_audit_event(_step.tenant_id, auth.uid(), 'journey.step_updated', 'journey_step', _step.id, null, jsonb_build_object('operation_id', _step.operation_id, 'operation_status', _op.status, 'planned_changed', coalesce(_apply_planned,false)));
  return jsonb_build_object('journey_step_id', _step.id);
end;
$$;

create or replace function public.update_journey_visit_point(_visit_point_id uuid, _title text, _interpretation text default null, _guide_tip text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _point public.journey_visit_points; _step public.journey_steps; _op public.operations; _title_clean text := nullif(btrim(coalesce(_title, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if; if _title_clean is null then raise exception 'Visit point title is required'; end if;
  select * into _point from public.journey_visit_points where id = _visit_point_id; if _point.id is null then raise exception 'Visit point not found'; end if; if coalesce((_point.metadata ->> 'archived')::boolean, false) then raise exception 'Archived visit points cannot be edited'; end if;
  _step := app_private.w04_step(_point.journey_step_id, array['owner','admin','operations_agent']); select * into _op from public.operations where id = _step.operation_id; if _op.status not in ('draft','planning') then raise exception 'Visit points can only be edited while the operation is in draft or planning'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_interpretation, '')), '')); perform app_private.assert_generic_note(nullif(btrim(coalesce(_guide_tip, '')), ''));
  update public.journey_visit_points set title = _title_clean, interpretation = nullif(btrim(coalesce(_interpretation, '')), ''), guide_tip = nullif(btrim(coalesce(_guide_tip, '')), ''), updated_at = now() where id = _point.id returning * into _point;
  perform app_private.record_audit_event(_point.tenant_id, auth.uid(), 'journey.visit_point_updated', 'journey_visit_point', _point.id, null, jsonb_build_object('operation_id', _point.operation_id, 'journey_step_id', _point.journey_step_id, 'title', _point.title)); return jsonb_build_object('visit_point_id', _point.id);
end;
$$;

create or replace function public.update_visit_point(_visit_point_id uuid, _title text default null, _interpretive_content text default null, _operational_note text default null, _estimated_minutes integer default null, _is_required boolean default null, _clear_estimated_minutes boolean default false, _clear_interpretive_content boolean default false, _clear_operational_note boolean default false)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _point public.journey_visit_points; _step public.journey_steps; _op public.operations; _title_clean text; _interpretation text; _guide_tip text; _metadata jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _point from public.journey_visit_points where id = _visit_point_id; if _point.id is null then raise exception 'Visit point not found'; end if; if coalesce((_point.metadata ->> 'archived')::boolean, false) then raise exception 'Archived visit points cannot be edited'; end if;
  _step := app_private.w04_step(_point.journey_step_id, array['owner','admin','operations_agent']); select * into _op from public.operations where id = _step.operation_id; if _op.status not in ('draft','planning') then raise exception 'Visit points can only be edited while the operation is in draft or planning'; end if;
  _title_clean := case when _title is null then _point.title else nullif(btrim(_title),'') end; if _title_clean is null then raise exception 'Visit point title is required'; end if;
  _interpretation := case when coalesce(_clear_interpretive_content,false) then null when _interpretive_content is null then _point.interpretation else nullif(btrim(_interpretive_content),'') end;
  _guide_tip := case when coalesce(_clear_operational_note,false) then null when _operational_note is null then _point.guide_tip else nullif(btrim(_operational_note),'') end;
  perform app_private.assert_visit_point_interpretation(_interpretation); perform app_private.assert_generic_note(_guide_tip);
  _metadata := coalesce(_point.metadata,'{}'::jsonb); if coalesce(_clear_estimated_minutes,false) then _metadata := _metadata - 'estimated_minutes'; elsif _estimated_minutes is not null then if _estimated_minutes <= 0 or _estimated_minutes > 1440 then raise exception 'Estimated minutes must be between 1 and 1440'; end if; _metadata := jsonb_set(_metadata, '{estimated_minutes}', to_jsonb(_estimated_minutes), true); end if; if _is_required is not null then _metadata := jsonb_set(_metadata, '{is_required}', to_jsonb(_is_required), true); end if;
  update public.journey_visit_points set title = _title_clean, interpretation = _interpretation, guide_tip = _guide_tip, metadata = _metadata, updated_at = now() where id = _point.id returning * into _point;
  perform app_private.record_audit_event(_point.tenant_id, auth.uid(), 'journey.visit_point_updated', 'journey_visit_point', _point.id, null, jsonb_build_object('operation_id', _point.operation_id, 'journey_step_id', _point.journey_step_id, 'title', _point.title)); return jsonb_build_object('visit_point_id', _point.id, 'sequence', _point.sequence);
end;
$$;

create or replace function public.get_my_journey(_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare _ctx jsonb; _steps jsonb;
begin
  _ctx := app_private.w10_assert_effective_access(_operation_id);
  select coalesce(jsonb_agg(x order by (x->>'sequence')::int), '[]'::jsonb) into _steps from (select jsonb_build_object('step_id', s.id, 'sequence', s.sequence, 'title', coalesce(s.traveler_label, s.title), 'step_kind', s.step_kind, 'location_label', s.location_label, 'planned_start', s.planned_start, 'planned_end', s.planned_end, 'expected_start', s.expected_start, 'expected_end', s.expected_end, 'updates', (select coalesce(jsonb_agg(jsonb_build_object('event_type', e.event_type, 'occurred_at', e.occurred_at, 'note', e.note) order by e.occurred_at), '[]'::jsonb) from public.journey_events e where e.journey_step_id = s.id and e.traveler_visible = true and e.event_type in ('STEP_STARTED','STEP_COMPLETED','GATHERING_STARTED','BOARDING_STARTED','BOARDING_COMPLETED','DEPARTED','ARRIVED','DISEMBARKATION_COMPLETED','EXPECTED_TIME_CHANGED'))) as x from public.journey_steps s where s.operation_id = _operation_id and s.archived_at is null and s.traveler_facing = true) t;
  return jsonb_build_object('operation_id', _operation_id, 'operation_status', _ctx->>'operation_status', 'participation_status', _ctx->>'participation_status', 'historical', coalesce((_ctx->>'historical')::boolean,false), 'read_only', coalesce((_ctx->>'read_only')::boolean,false), 'steps', _steps);
end;
$$;

create or replace function public.get_operation_participant_summary(_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare _op public.operations; _planned int := 0; _confirmed int := 0; _present int := 0; _boarded int := 0; _no_show int := 0; _unconfirmed int := 0; _health text := 'under_control'; _reason_code text := null; _reason_label text := null; _reasons jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if; select * into _op from public.operations o where o.id = _operation_id; if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then raise exception 'You do not have permission to view this operation summary'; end if;
  with roster as (select p.id, p.status from public.operation_participations p where p.operation_id = _op.id and p.participation_kind = 'participant' and p.status <> 'cancelled'), effective as (select e.id,e.participation_id,e.journey_step_id,e.presence_fact,e.occurred_at,e.recorded_at from public.participant_presence_events e where e.operation_id = _op.id and e.presence_fact <> 'PRESENCE_RETRACTED' and not exists (select 1 from public.participant_presence_events r where r.retracts_presence_event_id = e.id)), latest_overall as (select distinct on (e.participation_id) e.participation_id,e.presence_fact,e.occurred_at,e.recorded_at,e.id from effective e order by e.participation_id,e.occurred_at desc,e.recorded_at desc,e.id desc)
  select count(*)::int, count(*) filter (where r.status = 'confirmed')::int, count(*) filter (where exists (select 1 from latest_overall l where l.participation_id = r.id and l.presence_fact in ('PRESENT_AT_MEETING_POINT','BOARDED','DISEMBARKED')))::int, count(*) filter (where exists (select 1 from latest_overall l where l.participation_id = r.id and l.presence_fact = 'BOARDED'))::int, count(*) filter (where exists (select 1 from latest_overall l where l.participation_id = r.id and l.presence_fact = 'NO_SHOW_CONFIRMED'))::int into _planned,_confirmed,_present,_boarded,_no_show from roster r;
  _unconfirmed := greatest(_planned - _confirmed, 0);
  if _op.status not in ('completed','cancelled') then
    if _op.status = 'active' and _no_show > 0 then _reasons := _reasons || jsonb_build_array(jsonb_build_object('code','CONFIRMED_NO_SHOWS','count',_no_show,'label',format('%s viajante(s) estão classificados como no-show.', _no_show))); end if;
    if _op.status in ('ready','active') and _unconfirmed > 0 then _reasons := _reasons || jsonb_build_array(jsonb_build_object('code','UNCONFIRMED_PARTICIPANTS','count',_unconfirmed,'label',format('%s viajante(s) ainda precisam de confirmação.', _unconfirmed))); end if;
    if _op.status in ('ready','active') and _planned = 0 then _reasons := _reasons || jsonb_build_array(jsonb_build_object('code','NO_OPERATIONAL_PARTICIPANTS','count',0,'label','Nenhum viajante operacional está vinculado à operação.')); end if;
  end if;
  if jsonb_array_length(_reasons) > 0 then _health := 'attention'; _reason_code := _reasons->0->>'code'; _reason_label := _reasons->0->>'label'; end if;
  return jsonb_build_object('operation_id', _op.id, 'operation_status', _op.status, 'travelers', jsonb_build_object('planned',_planned,'confirmed',_confirmed,'unconfirmed',_unconfirmed,'present',_present,'boarded',_boarded,'no_show',_no_show), 'health', jsonb_build_object('status',_health,'reason_code',_reason_code,'reason_label',_reason_label,'reasons',_reasons));
end;
$$;

create or replace function public.authorize_departure(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations; _readiness jsonb; _id uuid;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin']); select * into _op from public.operations o where o.id = _step.operation_id; if _op.status <> 'active' then raise exception 'Departure can only be authorized on a running operation'; end if; if not app_private.w04_has_event(_step.id, 'STEP_STARTED') then raise exception 'This step has not started yet'; end if; if app_private.w04_has_event(_step.id, 'DEPARTURE_AUTHORIZED') then return jsonb_build_object('journey_step_id', _step.id, 'unchanged', true); end if;
  _readiness := public.w04_step_readiness(_step.id); if not (_readiness ->> 'ready')::boolean then raise exception 'This step is not ready yet: % checklist item(s) and % person(s) pending', jsonb_array_length(_readiness -> 'missing_required_items'), jsonb_array_length(_readiness -> 'missing_participations'); end if;
  _id := app_private.record_journey_event(_op, _step.id, 'DEPARTURE_AUTHORIZED', _occurred_at, null, jsonb_build_object('evaluated', _readiness -> 'evaluated', 'satisfied', _readiness -> 'satisfied', 'population', _readiness -> 'population', 'requirement', _readiness -> 'requirement'));
  perform app_private.record_audit_event(_step.tenant_id, auth.uid(), 'journey.departure_authorized', 'journey_step', _step.id, null, jsonb_build_object('operation_id', _op.id, 'readiness', _readiness)); return jsonb_build_object('journey_step_id', _step.id, 'journey_event_id', _id, 'readiness', _readiness);
end;
$$;

create or replace function public.retract_presence_fact(_presence_fact_id uuid, _reason text, _idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _uid uuid := auth.uid(); _orig public.participant_presence_events; _op public.operations; _why text := nullif(btrim(coalesce(_reason,'')),''); _existing jsonb; _id uuid; _result jsonb;
begin
  if _uid is null then raise exception 'Authentication required'; end if; if _idempotency_key is null then raise exception 'An idempotency key is required'; end if; if _why is null then raise exception 'A reason is required to retract a presence record'; end if; perform app_private.assert_generic_note(_why);
  select k.result into _existing from public.idempotency_keys k where k.actor_profile_id = _uid and k.action = 'presence.retract' and k.idempotency_key = _idempotency_key::text; if _existing is not null then return _existing; end if;
  select * into _orig from public.participant_presence_events e where e.id = _presence_fact_id; if _orig.id is null or not app_private.has_tenant_role(_orig.tenant_id, array['owner','admin']::public.app_role[]) then raise exception 'Presence record not found'; end if; if _orig.presence_fact = 'PRESENCE_RETRACTED' then raise exception 'A retraction cannot itself be retracted'; end if; if exists (select 1 from public.participant_presence_events r where r.retracts_presence_event_id = _orig.id) then raise exception 'This presence record has already been retracted'; end if;
  select * into _op from public.operations o where o.id = _orig.operation_id; if _op.status not in ('ready','active') then raise exception 'Presence can only be corrected while the operation is ready or running'; end if;
  perform set_config('app.w04_control','on', true); insert into public.participant_presence_events (tenant_id, operation_id, participation_id, journey_step_id, presence_fact, actor_profile_id, occurred_at, note, context, correlation_id, retracts_presence_event_id) values (_orig.tenant_id, _orig.operation_id, _orig.participation_id, _orig.journey_step_id, 'PRESENCE_RETRACTED', _uid, now(), _why, jsonb_build_object('reason', _why, 'retracted_presence_event_id', _orig.id, 'retracted_presence_fact', _orig.presence_fact), gen_random_uuid()::text, _orig.id) returning id into _id; perform set_config('app.w04_control','off', true);
  perform app_private.record_audit_event(_orig.tenant_id, _uid, 'presence.retracted', 'participant_presence_event', _orig.id, _idempotency_key::text, jsonb_build_object('operation_id', _orig.operation_id, 'journey_step_id', _orig.journey_step_id, 'participation_id', _orig.participation_id, 'retracted_presence_fact', _orig.presence_fact, 'retraction_event_id', _id, 'reason', _why));
  _result := jsonb_build_object('retracted_presence_event_id', _orig.id, 'retraction_event_id', _id, 'presence_fact', _orig.presence_fact, 'journey_step_id', _orig.journey_step_id); insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result) values (_orig.tenant_id, _uid, 'presence.retract', _idempotency_key::text, _result); return _result;
end;
$$;

create or replace function public.set_step_expected_window(_journey_step_id uuid, _expected_start timestamptz, _expected_end timestamptz, _reason text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations; _id uuid; _why text := nullif(btrim(coalesce(_reason,'')),''); _ctx jsonb;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']); select * into _op from public.operations o where o.id = _step.operation_id; if _why is null then raise exception 'A reason is required to change the forecast'; end if; if _expected_start is not null and _expected_end is not null and _expected_end < _expected_start then raise exception 'Invalid expected window'; end if; if _op.status not in ('planning','ready','active') then raise exception 'A % operation does not have an active forecast', _op.status; end if; if app_private.w04_has_event(_step.id, 'STEP_COMPLETED') or app_private.w04_has_event(_step.id, 'STEP_SKIPPED') then raise exception 'This step is already closed and its forecast can no longer change'; end if; perform app_private.assert_generic_note(_why);
  if _step.expected_start is not distinct from _expected_start and _step.expected_end is not distinct from _expected_end then return jsonb_build_object('journey_step_id', _step.id, 'unchanged', true, 'expected_start', _step.expected_start, 'expected_end', _step.expected_end); end if;
  _ctx := jsonb_build_object('previous_expected_start', _step.expected_start, 'previous_expected_end', _step.expected_end, 'new_expected_start', _expected_start, 'new_expected_end', _expected_end, 'reason', _why);
  perform set_config('app.w04_control','on', true); update public.journey_steps set expected_start = _expected_start, expected_end = _expected_end where id = _step.id; insert into public.journey_events (tenant_id, operation_id, journey_step_id, event_type, actor_profile_id, occurred_at, note, traveler_visible, context, correlation_id) values (_op.tenant_id, _op.id, _step.id, 'EXPECTED_TIME_CHANGED', auth.uid(), now(), null, app_private.w04_traveler_visibility('EXPECTED_TIME_CHANGED') and coalesce(_step.traveler_facing, false), _ctx, gen_random_uuid()::text) on conflict do nothing returning id into _id; perform set_config('app.w04_control','off', true);
  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'journey.step_expected_time_changed', 'journey_step', _step.id, null, _ctx); return jsonb_build_object('journey_step_id', _step.id, 'journey_event_id', _id, 'expected_start', _expected_start, 'expected_end', _expected_end);
end;
$$;
