create or replace function app_private.w07_assert_space_available(
  _event_id uuid,
  _session_id uuid,
  _venue_space_id uuid,
  _start timestamptz,
  _end timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if _venue_space_id is null or _start is null or _end is null then
    return;
  end if;
  if _end <= _start then
    raise exception 'The session end must be after the session start';
  end if;

  if exists (
    select 1
      from public.event_sessions s
     where s.event_id = _event_id
       and s.venue_space_id = _venue_space_id
       and (_session_id is null or s.id <> _session_id)
       and app_private.w07_derived_session_runtime_state(s.id) not in ('completed','cancelled')
       and coalesce(s.expected_start, s.planned_start) is not null
       and coalesce(s.expected_end, s.planned_end) is not null
       and coalesce(s.expected_start, s.planned_start) < _end
       and coalesce(s.expected_end, s.planned_end) > _start
  ) then
    raise exception 'This venue space is already occupied by another session in that time window';
  end if;
end;
$$;

revoke all on function app_private.w07_assert_space_available(uuid,uuid,uuid,timestamptz,timestamptz) from public;
revoke all on function app_private.w07_assert_space_available(uuid,uuid,uuid,timestamptz,timestamptz) from anon;
revoke all on function app_private.w07_assert_space_available(uuid,uuid,uuid,timestamptz,timestamptz) from authenticated;

create or replace function public.create_event_session(
  _event_id uuid,
  _title text,
  _idempotency_key text,
  _session_kind public.event_session_kind default 'talk'::public.event_session_kind,
  _venue_space_id uuid default null::uuid,
  _planned_start timestamptz default null::timestamptz,
  _planned_end timestamptz default null::timestamptz,
  _description text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
  if _planned_start is not null and _planned_end is not null then
    perform app_private.w07_assert_space_available(_ev.id, null, _venue_space_id, _planned_start, _planned_end);
  elsif (_planned_start is null) <> (_planned_end is null) then
    raise exception 'Provide both planned start and planned end for a timed session';
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
end;
$$;

create or replace function public.update_event_session(
  _session_id uuid,
  _idempotency_key text,
  _title text default null::text,
  _description text default null::text,
  _session_kind public.event_session_kind default null::public.event_session_kind,
  _venue_space_id uuid default null::uuid,
  _planned_start timestamptz default null::timestamptz,
  _planned_end timestamptz default null::timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _target_space uuid; _target_start timestamptz; _target_end timestamptz;
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

  _target_space := coalesce(_venue_space_id, _s.venue_space_id);
  _target_start := coalesce(_planned_start, _s.planned_start);
  _target_end := coalesce(_planned_end, _s.planned_end);
  if (_target_start is null) <> (_target_end is null) then
    raise exception 'Provide both planned start and planned end for a timed session';
  end if;
  perform app_private.w07_assert_space_available(_ev.id, _s.id, _target_space, _target_start, _target_end);
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
end;
$$;

create or replace function public.change_session_space(
  _session_id uuid,
  _venue_space_id uuid,
  _reason text,
  _idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _effective_start timestamptz; _effective_end timestamptz;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_s.event_id);
  perform app_private.w07_assert_event_internal(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.space', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'A reason is required to move a session'; end if;
  perform app_private.assert_generic_note(btrim(_reason));
  if app_private.w07_derived_session_runtime_state(_session_id) in ('completed','cancelled') then
    raise exception 'This session is closed and can no longer be moved';
  end if;
  if _venue_space_id is not distinct from _s.venue_space_id then
    _out := jsonb_build_object('session_id', _session_id, 'unchanged', true);
    perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.space', _key, _out);
    return _out;
  end if;
  if _venue_space_id is not null then
    if _ev.venue_id is null then raise exception 'Assign a venue to the event before assigning a space'; end if;
    if not exists (select 1 from public.venue_spaces s
                    where s.id = _venue_space_id and s.tenant_id = _ev.tenant_id
                      and s.venue_id = _ev.venue_id and s.is_active)
      then raise exception 'That space does not belong to the venue of this event'; end if;
  end if;

  _effective_start := coalesce(_s.expected_start, _s.planned_start);
  _effective_end := coalesce(_s.expected_end, _s.planned_end);
  perform app_private.w07_assert_space_available(_ev.id, _s.id, _venue_space_id, _effective_start, _effective_end);

  perform set_config('app.w07_control','on', true);
  update public.event_sessions set venue_space_id = _venue_space_id where id = _session_id;
  perform set_config('app.w07_control','off', true);

  perform app_private.w07_record_runtime_event(_ev, 'SESSION_SPACE_CHANGED', _session_id,
    _venue_space_id, null, false, null, null, btrim(_reason),
    jsonb_build_object('previous_venue_space_id', _s.venue_space_id,
      'venue_space_id', _venue_space_id, 'reason', btrim(_reason)), _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.space.changed',
    'event_session', _session_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('session_id', _session_id, 'unchanged', false);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.space', _key, _out);
  return _out;
end;
$$;