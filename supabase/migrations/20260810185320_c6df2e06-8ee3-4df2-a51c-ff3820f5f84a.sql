-- =============================== W07 PLANNING COMMANDS (1-21) ===============
create or replace function public.create_venue(
  _tenant_id uuid, _name text, _idempotency_key text,
  _country_code char(2) default null, _region text default null, _city text default null,
  _address_label text default null, _timezone text default null,
  _contact_label text default null, _notes text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _row public.venues; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id, array['owner','admin','operations_agent']::public.app_role[])
    then raise exception 'You do not have permission for event production in this organization'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.venue.create', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_name,'')),'') is null then raise exception 'A venue name is required'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w07_control','on', true);
  insert into public.venues (tenant_id, name, country_code, region, city, address_label,
    timezone, contact_label, notes, created_by)
  values (_tenant_id, btrim(_name), _country_code, nullif(btrim(coalesce(_region,'')),''),
    nullif(btrim(coalesce(_city,'')),''), nullif(btrim(coalesce(_address_label,'')),''),
    nullif(btrim(coalesce(_timezone,'')),''), nullif(btrim(coalesce(_contact_label,'')),''),
    nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'event.venue.created',
    'venue', _row.id, _key, '{}'::jsonb);
  _out := jsonb_build_object('venue_id', _row.id, 'tenant_id', _tenant_id);
  perform app_private.w06_claim_key(_tenant_id, 'event.venue.create', _key, _out);
  return _out;
end; $$;

create or replace function public.update_venue(
  _venue_id uuid, _idempotency_key text,
  _name text default null, _country_code char(2) default null, _region text default null,
  _city text default null, _address_label text default null, _timezone text default null,
  _contact_label text default null, _notes text default null, _is_active boolean default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _row public.venues; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _row from public.venues v where v.id = _venue_id;
  if _row.id is null then raise exception 'Venue not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[])
    then raise exception 'You do not have permission for event production in this organization'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.venue.update', _key);
  if _out is not null then return _out; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w07_control','on', true);
  update public.venues set
    name = coalesce(nullif(btrim(coalesce(_name,'')),''), name),
    country_code = coalesce(_country_code, country_code),
    region = coalesce(nullif(btrim(coalesce(_region,'')),''), region),
    city = coalesce(nullif(btrim(coalesce(_city,'')),''), city),
    address_label = coalesce(nullif(btrim(coalesce(_address_label,'')),''), address_label),
    timezone = coalesce(nullif(btrim(coalesce(_timezone,'')),''), timezone),
    contact_label = coalesce(nullif(btrim(coalesce(_contact_label,'')),''), contact_label),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes),
    is_active = coalesce(_is_active, is_active)
  where id = _venue_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'event.venue.updated',
    'venue', _venue_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('venue_id', _venue_id);
  perform app_private.w06_claim_key(_row.tenant_id, 'event.venue.update', _key, _out);
  return _out;
end; $$;

create or replace function public.create_venue_space(
  _venue_id uuid, _name text, _idempotency_key text,
  _space_label text default null, _planning_capacity integer default null,
  _floor_label text default null, _notes text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _venue public.venues; _row public.venue_spaces;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _venue from public.venues v where v.id = _venue_id;
  if _venue.id is null then raise exception 'Venue not found'; end if;
  if not app_private.has_tenant_role(_venue.tenant_id, array['owner','admin','operations_agent']::public.app_role[])
    then raise exception 'You do not have permission for event production in this organization'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.space.create', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_name,'')),'') is null then raise exception 'A space name is required'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w07_control','on', true);
  insert into public.venue_spaces (tenant_id, venue_id, name, space_label, planning_capacity,
    floor_label, notes, created_by)
  values (_venue.tenant_id, _venue.id, btrim(_name), nullif(btrim(coalesce(_space_label,'')),''),
    _planning_capacity, nullif(btrim(coalesce(_floor_label,'')),''),
    nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_venue.tenant_id, auth.uid(), 'event.space.created',
    'venue_space', _row.id, _key, jsonb_build_object('venue_id', _venue.id));
  _out := jsonb_build_object('venue_space_id', _row.id, 'venue_id', _venue.id);
  perform app_private.w06_claim_key(_venue.tenant_id, 'event.space.create', _key, _out);
  return _out;
end; $$;

create or replace function public.update_venue_space(
  _space_id uuid, _idempotency_key text, _name text default null,
  _space_label text default null, _planning_capacity integer default null,
  _floor_label text default null, _notes text default null, _is_active boolean default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _row public.venue_spaces; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _row from public.venue_spaces s where s.id = _space_id;
  if _row.id is null then raise exception 'Space not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[])
    then raise exception 'You do not have permission for event production in this organization'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.space.update', _key);
  if _out is not null then return _out; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w07_control','on', true);
  update public.venue_spaces set
    name = coalesce(nullif(btrim(coalesce(_name,'')),''), name),
    space_label = coalesce(nullif(btrim(coalesce(_space_label,'')),''), space_label),
    planning_capacity = coalesce(_planning_capacity, planning_capacity),
    floor_label = coalesce(nullif(btrim(coalesce(_floor_label,'')),''), floor_label),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes),
    is_active = coalesce(_is_active, is_active)
  where id = _space_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'event.space.updated',
    'venue_space', _space_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('venue_space_id', _space_id);
  perform app_private.w06_claim_key(_row.tenant_id, 'event.space.update', _key, _out);
  return _out;
end; $$;

create or replace function public.create_event(
  _operation_id uuid, _name text, _source_kind public.event_source_kind,
  _planned_start timestamptz, _planned_end timestamptz, _idempotency_key text,
  _venue_id uuid default null, _external_producer_name text default null,
  _timezone text default null, _notes text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _op public.operations; _venue public.venues; _row public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id, array['owner','admin','operations_agent']::public.app_role[])
    then raise exception 'You do not have permission for event production in this organization'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.create', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_name,'')),'') is null then raise exception 'An event name is required'; end if;
  if _planned_end <= _planned_start then raise exception 'The planned end must be after the planned start'; end if;
  if _source_kind = 'external'
     and nullif(btrim(coalesce(_external_producer_name,'')),'') is null then
    raise exception 'An external event requires the producer name';
  end if;
  if _venue_id is not null then
    select * into _venue from public.venues v where v.id = _venue_id and v.tenant_id = _op.tenant_id;
    if _venue.id is null then raise exception 'Venue not found in this organization'; end if;
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w07_control','on', true);
  insert into public.events (tenant_id, operation_id, venue_id, name, source_kind,
    external_producer_name, timezone, planned_start, planned_end, notes, created_by)
  values (_op.tenant_id, _op.id, _venue_id, btrim(_name), _source_kind,
    case when _source_kind = 'external' then btrim(_external_producer_name) end,
    coalesce(nullif(btrim(coalesce(_timezone,'')),''), _op.timezone),
    _planned_start, _planned_end, nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'event.created',
    'event', _row.id, _key, jsonb_build_object('source_kind', _source_kind));
  _out := jsonb_build_object('event_id', _row.id, 'operation_id', _op.id, 'tenant_id', _op.tenant_id);
  perform app_private.w06_claim_key(_op.tenant_id, 'event.create', _key, _out);
  return _out;
end; $$;

create or replace function public.update_event(
  _event_id uuid, _idempotency_key text, _name text default null, _venue_id uuid default null,
  _external_producer_name text default null, _planned_start timestamptz default null,
  _planned_end timestamptz default null, _notes text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _ps timestamptz; _pe timestamptz;
begin
  _ev := app_private.w07_require_event_write(_event_id);
  perform app_private.w07_assert_event_non_terminal(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.update', _key);
  if _out is not null then return _out; end if;

  _ps := coalesce(_planned_start, _ev.planned_start);
  _pe := coalesce(_planned_end, _ev.planned_end);
  if (_ps, _pe) is distinct from (_ev.planned_start, _ev.planned_end) then
    perform app_private.w07_assert_program_unlocked(_ev);
    if _pe <= _ps then raise exception 'The planned end must be after the planned start'; end if;
  end if;
  if _venue_id is not null and not exists (
      select 1 from public.venues v where v.id = _venue_id and v.tenant_id = _ev.tenant_id)
    then raise exception 'Venue not found in this organization'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w07_control','on', true);
  update public.events set
    name = coalesce(nullif(btrim(coalesce(_name,'')),''), name),
    venue_id = coalesce(_venue_id, venue_id),
    external_producer_name = case when source_kind = 'external'
      then coalesce(nullif(btrim(coalesce(_external_producer_name,'')),''), external_producer_name)
      else null end,
    planned_start = _ps, planned_end = _pe,
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes)
  where id = _event_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.updated',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.update', _key, _out);
  return _out;
end; $$;

create or replace function public.submit_event_planning(_event_id uuid, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_write(_event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.planning.submit', _key);
  if _out is not null then return _out; end if;
  if _ev.status = 'planning' then
    _out := jsonb_build_object('event_id', _event_id, 'unchanged', true);
    perform app_private.w06_claim_key(_ev.tenant_id, 'event.planning.submit', _key, _out);
    return _out;
  end if;
  if _ev.status <> 'draft' then raise exception 'Only a draft event can be moved to planning'; end if;
  perform set_config('app.w07_control','on', true);
  update public.events set status = 'planning' where id = _event_id;
  perform set_config('app.w07_control','off', true);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.planning.submitted',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'unchanged', false);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.planning.submit', _key, _out);
  return _out;
end; $$;

create or replace function public.lock_event_program(_event_id uuid, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_write(_event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.program.lock', _key);
  if _out is not null then return _out; end if;
  if _ev.status = 'program_locked' then
    _out := jsonb_build_object('event_id', _event_id, 'unchanged', true);
    perform app_private.w06_claim_key(_ev.tenant_id, 'event.program.lock', _key, _out);
    return _out;
  end if;
  if _ev.status <> 'planning' then raise exception 'Only an event in planning can have its program locked'; end if;
  if not exists (select 1 from public.event_sessions s where s.event_id = _event_id) then
    raise exception 'The program needs at least one session before it can be locked';
  end if;
  perform set_config('app.w07_control','on', true);
  update public.events set status = 'program_locked' where id = _event_id;
  perform set_config('app.w07_control','off', true);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.program.locked',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'unchanged', false);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.program.lock', _key, _out);
  return _out;
end; $$;

create or replace function public.reopen_event_program(_event_id uuid, _idempotency_key text, _reason text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_write(_event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.program.reopen', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'A reason is required to reopen the program'; end if;
  if _ev.status <> 'program_locked' then raise exception 'Only a locked program can be reopened'; end if;
  if exists (select 1 from public.event_runtime_events r where r.event_id = _event_id) then
    raise exception 'This event already has runtime facts; the program can no longer be reopened';
  end if;
  perform app_private.assert_generic_note(btrim(_reason));
  perform set_config('app.w07_control','on', true);
  update public.events set status = 'planning' where id = _event_id;
  perform set_config('app.w07_control','off', true);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.program.reopened',
    'event', _event_id, _key, jsonb_build_object('reason', btrim(_reason)));
  _out := jsonb_build_object('event_id', _event_id);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.program.reopen', _key, _out);
  return _out;
end; $$;

create or replace function public.mark_event_ready(_event_id uuid, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_write(_event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.ready', _key);
  if _out is not null then return _out; end if;
  if _ev.status = 'ready' then
    _out := jsonb_build_object('event_id', _event_id, 'unchanged', true);
    perform app_private.w06_claim_key(_ev.tenant_id, 'event.ready', _key, _out);
    return _out;
  end if;
  if _ev.status <> 'program_locked' then raise exception 'Only a locked program can be marked ready'; end if;
  perform set_config('app.w07_control','on', true);
  update public.events set status = 'ready' where id = _event_id;
  perform set_config('app.w07_control','off', true);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.ready',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'unchanged', false);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.ready', _key, _out);
  return _out;
end; $$;

create or replace function public.set_event_expected_window(
  _event_id uuid, _idempotency_key text, _reason text,
  _expected_start timestamptz default null, _expected_end timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _s timestamptz; _e timestamptz;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.expected', _key);
  if _out is not null then return _out; end if;

  _s := coalesce(_expected_start, _ev.expected_start);
  _e := coalesce(_expected_end, _ev.expected_end);
  if _s is not distinct from _ev.expected_start and _e is not distinct from _ev.expected_end then
    _out := jsonb_build_object('event_id', _event_id, 'unchanged', true);
    perform app_private.w06_claim_key(_ev.tenant_id, 'event.expected', _key, _out);
    return _out;
  end if;
  if _s is not null and _e is not null and _e <= _s then
    raise exception 'The expected end must be after the expected start';
  end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then
    raise exception 'A reason is required to change the expected window';
  end if;
  perform app_private.assert_generic_note(btrim(_reason));

  perform set_config('app.w07_control','on', true);
  update public.events set expected_start = _s, expected_end = _e where id = _event_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.w07_record_runtime_event(_ev, 'EVENT_EXPECTED_TIME_CHANGED', null, null,
    null, false, null, null, btrim(_reason),
    jsonb_build_object('previous_expected_start', _ev.expected_start,
      'previous_expected_end', _ev.expected_end,
      'expected_start', _s, 'expected_end', _e, 'reason', btrim(_reason)), _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.expected.changed',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'unchanged', false);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.expected', _key, _out);
  return _out;
end; $$;

create or replace function public.link_event_journey_step(
  _event_id uuid, _idempotency_key text, _journey_step_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _step public.journey_steps;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.journey.link', _key);
  if _out is not null then return _out; end if;

  if _journey_step_id is not null then
    select * into _step from public.journey_steps s where s.id = _journey_step_id;
    if _step.id is null or _step.tenant_id <> _ev.tenant_id or _step.operation_id <> _ev.operation_id then
      raise exception 'That journey step does not belong to this operation';
    end if;
  end if;

  perform set_config('app.w07_control','on', true);
  update public.events set journey_step_id = _journey_step_id where id = _event_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.journey.linked',
    'event', _event_id, _key, jsonb_build_object('journey_step_id', _journey_step_id));
  _out := jsonb_build_object('event_id', _event_id, 'journey_step_id', _journey_step_id);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.journey.link', _key, _out);
  return _out;
end; $$;

create or replace function public.create_event_session(
  _event_id uuid, _title text, _idempotency_key text,
  _session_kind public.event_session_kind default 'talk', _venue_space_id uuid default null,
  _planned_start timestamptz default null, _planned_end timestamptz default null,
  _description text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _row public.event_sessions;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_write(_event_id);
  perform app_private.w07_assert_event_non_terminal(_ev);
  perform app_private.w07_assert_program_unlocked(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.create', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_title,'')),'') is null then raise exception 'A session title is required'; end if;
  if _venue_space_id is not null then
    if _ev.venue_id is null then raise exception 'Assign a venue to the event before assigning a space'; end if;
    if not exists (select 1 from public.venue_spaces s
                    where s.id = _venue_space_id and s.tenant_id = _ev.tenant_id
                      and s.venue_id = _ev.venue_id)
      then raise exception 'That space does not belong to the venue of this event'; end if;
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));

  perform set_config('app.w07_control','on', true);
  insert into public.event_sessions (tenant_id, event_id, venue_space_id, sequence, title,
    description, session_kind, planned_start, planned_end, created_by)
  values (_ev.tenant_id, _ev.id, _venue_space_id, app_private.w07_next_session_sequence(_ev.id),
    btrim(_title), nullif(btrim(coalesce(_description,'')),''), _session_kind,
    _planned_start, _planned_end, auth.uid())
  returning * into _row;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.created',
    'event_session', _row.id, _key, jsonb_build_object('event_id', _ev.id));
  _out := jsonb_build_object('session_id', _row.id, 'event_id', _ev.id);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.create', _key, _out);
  return _out;
end; $$;

create or replace function public.update_event_session(
  _session_id uuid, _idempotency_key text, _title text default null,
  _description text default null, _session_kind public.event_session_kind default null,
  _venue_space_id uuid default null, _planned_start timestamptz default null,
  _planned_end timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_write(_s.event_id);
  perform app_private.w07_assert_event_non_terminal(_ev);
  perform app_private.w07_assert_program_unlocked(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.update', _key);
  if _out is not null then return _out; end if;
  if _venue_space_id is not null then
    if _ev.venue_id is null then raise exception 'Assign a venue to the event before assigning a space'; end if;
    if not exists (select 1 from public.venue_spaces s
                    where s.id = _venue_space_id and s.tenant_id = _ev.tenant_id
                      and s.venue_id = _ev.venue_id)
      then raise exception 'That space does not belong to the venue of this event'; end if;
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));

  perform set_config('app.w07_control','on', true);
  update public.event_sessions set
    title = coalesce(nullif(btrim(coalesce(_title,'')),''), title),
    description = coalesce(nullif(btrim(coalesce(_description,'')),''), description),
    session_kind = coalesce(_session_kind, session_kind),
    venue_space_id = coalesce(_venue_space_id, venue_space_id),
    planned_start = coalesce(_planned_start, planned_start),
    planned_end = coalesce(_planned_end, planned_end)
  where id = _session_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.updated',
    'event_session', _session_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('session_id', _session_id);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.update', _key, _out);
  return _out;
end; $$;

create or replace function public.reorder_event_sessions(
  _event_id uuid, _session_ids uuid[], _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _count integer;
begin
  _ev := app_private.w07_require_event_write(_event_id);
  perform app_private.w07_assert_event_non_terminal(_ev);
  perform app_private.w07_assert_program_unlocked(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.reorder', _key);
  if _out is not null then return _out; end if;

  select count(*) into _count from public.event_sessions s where s.event_id = _event_id;
  if _count <> coalesce(array_length(_session_ids, 1), 0) then
    raise exception 'The new order must contain every session of this event exactly once';
  end if;
  if exists (select 1 from unnest(_session_ids) u(id)
              where not exists (select 1 from public.event_sessions s
                                 where s.id = u.id and s.event_id = _event_id))
    then raise exception 'The new order references a session outside this event'; end if;
  if (select count(distinct u.id) from unnest(_session_ids) u(id)) <> _count then
    raise exception 'The new order must contain every session of this event exactly once';
  end if;

  perform set_config('app.w07_control','on', true);
  update public.event_sessions s set sequence = o.ord
    from (select u.id, row_number() over () as ord from unnest(_session_ids) u(id)) o
   where s.id = o.id and s.event_id = _event_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.reordered',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'count', _count);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.reorder', _key, _out);
  return _out;
end; $$;

create or replace function public.create_ad_hoc_session(
  _event_id uuid, _title text, _ad_hoc_reason text, _idempotency_key text,
  _session_kind public.event_session_kind default 'other', _venue_space_id uuid default null,
  _planned_start timestamptz default null, _planned_end timestamptz default null,
  _description text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _row public.event_sessions;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  perform app_private.w07_assert_program_locked(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.adhoc', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_title,'')),'') is null then raise exception 'A session title is required'; end if;
  if nullif(btrim(coalesce(_ad_hoc_reason,'')),'') is null then
    raise exception 'An ad-hoc session requires a reason';
  end if;
  perform app_private.assert_generic_note(btrim(_ad_hoc_reason));
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_description,'')),''));
  if _venue_space_id is not null then
    if _ev.venue_id is null then raise exception 'Assign a venue to the event before assigning a space'; end if;
    if not exists (select 1 from public.venue_spaces s
                    where s.id = _venue_space_id and s.tenant_id = _ev.tenant_id
                      and s.venue_id = _ev.venue_id)
      then raise exception 'That space does not belong to the venue of this event'; end if;
  end if;

  perform set_config('app.w07_control','on', true);
  insert into public.event_sessions (tenant_id, event_id, venue_space_id, sequence, title,
    description, session_kind, is_ad_hoc, ad_hoc_reason, planned_start, planned_end, created_by)
  values (_ev.tenant_id, _ev.id, _venue_space_id, app_private.w07_next_session_sequence(_ev.id),
    btrim(_title), nullif(btrim(coalesce(_description,'')),''), _session_kind, true,
    btrim(_ad_hoc_reason), _planned_start, _planned_end, auth.uid())
  returning * into _row;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.adhoc.created',
    'event_session', _row.id, _key, jsonb_build_object('reason', btrim(_ad_hoc_reason)));
  _out := jsonb_build_object('session_id', _row.id, 'event_id', _ev.id, 'is_ad_hoc', true);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.adhoc', _key, _out);
  return _out;
end; $$;

create or replace function public.set_session_expected_window(
  _session_id uuid, _idempotency_key text, _reason text,
  _expected_start timestamptz default null, _expected_end timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _st timestamptz; _en timestamptz;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_s.event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.expected', _key);
  if _out is not null then return _out; end if;

  _st := coalesce(_expected_start, _s.expected_start);
  _en := coalesce(_expected_end, _s.expected_end);
  if _st is not distinct from _s.expected_start and _en is not distinct from _s.expected_end then
    _out := jsonb_build_object('session_id', _session_id, 'unchanged', true);
    perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.expected', _key, _out);
    return _out;
  end if;
  if _st is not null and _en is not null and _en <= _st then
    raise exception 'The expected end must be after the expected start';
  end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then
    raise exception 'A reason is required to change the expected window';
  end if;
  perform app_private.assert_generic_note(btrim(_reason));
  if app_private.w07_derived_session_runtime_state(_session_id) in ('completed','cancelled') then
    raise exception 'This session is closed and can no longer be re-forecast';
  end if;

  perform set_config('app.w07_control','on', true);
  update public.event_sessions set expected_start = _st, expected_end = _en where id = _session_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.w07_record_runtime_event(_ev, 'SESSION_EXPECTED_TIME_CHANGED', _session_id,
    null, null, false, null, null, btrim(_reason),
    jsonb_build_object('previous_expected_start', _s.expected_start,
      'previous_expected_end', _s.expected_end, 'expected_start', _st, 'expected_end', _en,
      'reason', btrim(_reason)), _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.expected.changed',
    'event_session', _session_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('session_id', _session_id, 'unchanged', false);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.expected', _key, _out);
  return _out;
end; $$;

create or replace function public.assign_session_speaker(
  _session_id uuid, _person_id uuid, _idempotency_key text,
  _speaking_role text default null, _presentation_title text default null,
  _sort_order integer default 0, _notes text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events; _row public.event_session_speakers;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_s.event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.speaker.assign', _key);
  if _out is not null then return _out; end if;
  if not exists (select 1 from public.people p where p.id = _person_id and p.tenant_id = _ev.tenant_id)
    then raise exception 'Person not found in this organization'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));
  if exists (select 1 from public.event_session_speakers sp
              where sp.session_id = _session_id and sp.person_id = _person_id) then
    raise exception 'This person is already a speaker in this session';
  end if;

  perform set_config('app.w07_control','on', true);
  insert into public.event_session_speakers (tenant_id, event_id, session_id, person_id,
    speaking_role, presentation_title, sort_order, notes, created_by)
  values (_ev.tenant_id, _ev.id, _session_id, _person_id,
    nullif(btrim(coalesce(_speaking_role,'')),''), nullif(btrim(coalesce(_presentation_title,'')),''),
    coalesce(_sort_order, 0), nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.speaker.assigned',
    'event_session_speaker', _row.id, _key, jsonb_build_object('session_id', _session_id));
  _out := jsonb_build_object('speaker_id', _row.id, 'session_id', _session_id);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.speaker.assign', _key, _out);
  return _out;
end; $$;

create or replace function public.remove_session_speaker(_speaker_id uuid, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _row public.event_session_speakers; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _row from public.event_session_speakers x where x.id = _speaker_id;
  if _row.id is null then raise exception 'Speaker assignment not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_row.event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.speaker.remove', _key);
  if _out is not null then return _out; end if;

  perform set_config('app.w07_control','on', true);
  delete from public.event_session_speakers where id = _speaker_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.speaker.removed',
    'event_session_speaker', _speaker_id, _key, jsonb_build_object('session_id', _row.session_id));
  _out := jsonb_build_object('speaker_id', _speaker_id, 'removed', true);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.speaker.remove', _key, _out);
  return _out;
end; $$;

create or replace function public.assign_event_staff(
  _event_id uuid, _person_id uuid, _staff_function public.event_staff_function,
  _idempotency_key text, _session_id uuid default null, _venue_space_id uuid default null,
  _notes text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _row public.event_staff_assignments;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.staff.assign', _key);
  if _out is not null then return _out; end if;
  if not exists (select 1 from public.people p where p.id = _person_id and p.tenant_id = _ev.tenant_id)
    then raise exception 'Person not found in this organization'; end if;
  if _session_id is not null then
    perform app_private.w07_assert_session_in_event(_session_id, _event_id);
  end if;
  if _venue_space_id is not null then
    if _ev.venue_id is null then raise exception 'Assign a venue to the event before scoping staff to a space'; end if;
    if not exists (select 1 from public.venue_spaces s
                    where s.id = _venue_space_id and s.tenant_id = _ev.tenant_id
                      and s.venue_id = _ev.venue_id)
      then raise exception 'That space does not belong to the venue of this event'; end if;
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w07_control','on', true);
  insert into public.event_staff_assignments (tenant_id, event_id, session_id, venue_space_id,
    person_id, staff_function, notes, created_by)
  values (_ev.tenant_id, _ev.id, _session_id, _venue_space_id, _person_id, _staff_function,
    nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.staff.assigned',
    'event_staff_assignment', _row.id, _key, jsonb_build_object('function', _staff_function));
  _out := jsonb_build_object('assignment_id', _row.id, 'event_id', _ev.id);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.staff.assign', _key, _out);
  return _out;
end; $$;

create or replace function public.remove_event_staff(_assignment_id uuid, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _row public.event_staff_assignments; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _row from public.event_staff_assignments x where x.id = _assignment_id;
  if _row.id is null then raise exception 'Staff assignment not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_row.event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.staff.remove', _key);
  if _out is not null then return _out; end if;

  perform set_config('app.w07_control','on', true);
  delete from public.event_staff_assignments where id = _assignment_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.staff.removed',
    'event_staff_assignment', _assignment_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('assignment_id', _assignment_id, 'removed', true);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.staff.remove', _key, _out);
  return _out;
end; $$;