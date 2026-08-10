-- ============================ W07 RUNTIME COMMANDS (22-35) ==================
create or replace function public.start_event(
  _event_id uuid, _idempotency_key text, _occurred_at timestamptz default null,
  _note text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  perform app_private.w07_assert_event_internal(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.start', _key);
  if _out is not null then return _out; end if;
  if _ev.status <> 'ready' then raise exception 'The event must be ready before it can start'; end if;
  if app_private.w07_derived_event_runtime_state(_event_id) <> 'scheduled' then
    raise exception 'This event has already started';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'EVENT_STARTED', null, null, _occurred_at,
    false, null, null, _note, '{}'::jsonb, _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.started',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'runtime_state', 'running');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.start', _key, _out);
  return _out;
end; $$;

create or replace function public.complete_event(
  _event_id uuid, _idempotency_key text, _occurred_at timestamptz default null,
  _note text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  perform app_private.w07_assert_event_internal(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.complete', _key);
  if _out is not null then return _out; end if;
  if app_private.w07_derived_event_runtime_state(_event_id) <> 'running' then
    raise exception 'Only a running event can be completed';
  end if;
  if exists (select 1 from public.event_sessions s
              where s.event_id = _event_id
                and app_private.w07_derived_session_runtime_state(s.id) in ('running','paused')) then
    raise exception 'Close every running or paused session before completing the event';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'EVENT_COMPLETED', null, null, _occurred_at,
    false, null, null, _note, '{}'::jsonb, _key);
  perform app_private.w07_close_out_event(_event_id);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.completed',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'runtime_state', 'completed', 'status', 'closed_out');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.complete', _key, _out);
  return _out;
end; $$;

create or replace function public.cancel_event(
  _event_id uuid, _reason text, _idempotency_key text,
  _observed_at timestamptz default null, _observer_note text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _observed boolean;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.cancel', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'A reason is required to cancel an event'; end if;
  perform app_private.assert_generic_note(btrim(_reason));
  if app_private.w07_derived_event_runtime_state(_event_id) in ('completed','cancelled') then
    raise exception 'This event is already closed';
  end if;
  _observed := _ev.source_kind = 'external';
  if _observed then
    if _observed_at is null or nullif(btrim(coalesce(_observer_note,'')),'') is null then
      raise exception 'Observing an external cancellation requires the observed time and an observer note';
    end if;
    perform app_private.assert_generic_note(btrim(_observer_note));
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'EVENT_CANCELLED', null, null,
    case when _observed then _observed_at else null end, _observed,
    case when _observed then _observed_at else null end,
    case when _observed then btrim(_observer_note) else null end,
    btrim(_reason), jsonb_build_object('reason', btrim(_reason)), _key);
  perform app_private.w07_close_out_event(_event_id);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.cancelled',
    'event', _event_id, _key, jsonb_build_object('observed', _observed));
  _out := jsonb_build_object('event_id', _event_id, 'runtime_state', 'cancelled',
    'status', 'closed_out', 'observed', _observed);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.cancel', _key, _out);
  return _out;
end; $$;

create or replace function public.start_session(
  _session_id uuid, _idempotency_key text, _occurred_at timestamptz default null,
  _note text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_s.event_id);
  perform app_private.w07_assert_event_internal(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.start', _key);
  if _out is not null then return _out; end if;
  if app_private.w07_derived_event_runtime_state(_ev.id) <> 'running' then
    raise exception 'Start the event before starting a session';
  end if;
  if app_private.w07_derived_session_runtime_state(_session_id) <> 'scheduled' then
    raise exception 'Only a scheduled session can be started';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'SESSION_STARTED', _session_id, _s.venue_space_id,
    _occurred_at, false, null, null, _note, '{}'::jsonb, _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.started',
    'event_session', _session_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('session_id', _session_id, 'runtime_state', 'running');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.start', _key, _out);
  return _out;
end; $$;

create or replace function public.pause_session(
  _session_id uuid, _idempotency_key text, _occurred_at timestamptz default null,
  _note text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_s.event_id);
  perform app_private.w07_assert_event_internal(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.pause', _key);
  if _out is not null then return _out; end if;
  perform 1 from public.event_sessions where id = _session_id for update;
  if app_private.w07_derived_session_runtime_state(_session_id) <> 'running' then
    raise exception 'Only a running session can be paused';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'SESSION_PAUSED', _session_id, _s.venue_space_id,
    _occurred_at, false, null, null, _note, '{}'::jsonb, _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.paused',
    'event_session', _session_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('session_id', _session_id, 'runtime_state', 'paused');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.pause', _key, _out);
  return _out;
end; $$;

create or replace function public.resume_session(
  _session_id uuid, _idempotency_key text, _occurred_at timestamptz default null,
  _note text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_s.event_id);
  perform app_private.w07_assert_event_internal(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.resume', _key);
  if _out is not null then return _out; end if;
  perform 1 from public.event_sessions where id = _session_id for update;
  if app_private.w07_derived_session_runtime_state(_session_id) <> 'paused' then
    raise exception 'Only a paused session can be resumed';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'SESSION_RESUMED', _session_id, _s.venue_space_id,
    _occurred_at, false, null, null, _note, '{}'::jsonb, _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.resumed',
    'event_session', _session_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('session_id', _session_id, 'runtime_state', 'running');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.resume', _key, _out);
  return _out;
end; $$;

create or replace function public.complete_session(
  _session_id uuid, _idempotency_key text, _occurred_at timestamptz default null,
  _note text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_s.event_id);
  perform app_private.w07_assert_event_internal(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.complete', _key);
  if _out is not null then return _out; end if;
  if app_private.w07_derived_session_runtime_state(_session_id) <> 'running' then
    raise exception 'Only a running session can be completed; resume it first if it is paused';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'SESSION_COMPLETED', _session_id, _s.venue_space_id,
    _occurred_at, false, null, null, _note, '{}'::jsonb, _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.completed',
    'event_session', _session_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('session_id', _session_id, 'runtime_state', 'completed');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.complete', _key, _out);
  return _out;
end; $$;

create or replace function public.cancel_session(
  _session_id uuid, _reason text, _idempotency_key text, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_s.event_id);
  perform app_private.w07_assert_event_internal(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.session.cancel', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'A reason is required to cancel a session'; end if;
  perform app_private.assert_generic_note(btrim(_reason));
  if app_private.w07_derived_session_runtime_state(_session_id) in ('completed','cancelled') then
    raise exception 'This session is already closed';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'SESSION_CANCELLED', _session_id, _s.venue_space_id,
    _occurred_at, false, null, null, btrim(_reason), jsonb_build_object('reason', btrim(_reason)), _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.session.cancelled',
    'event_session', _session_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('session_id', _session_id, 'runtime_state', 'cancelled');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.session.cancel', _key, _out);
  return _out;
end; $$;

create or replace function public.change_session_space(
  _session_id uuid, _venue_space_id uuid, _reason text, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
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
end; $$;

create or replace function public.record_observed_event_started(
  _event_id uuid, _observed_at timestamptz, _observer_note text, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  perform app_private.w07_assert_event_external(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.observed.start', _key);
  if _out is not null then return _out; end if;
  if _observed_at is null or nullif(btrim(coalesce(_observer_note,'')),'') is null then
    raise exception 'Recording an observation requires the observed time and an observer note';
  end if;
  perform app_private.assert_generic_note(btrim(_observer_note));
  if app_private.w07_derived_event_runtime_state(_event_id) <> 'scheduled' then
    raise exception 'This event has already been observed as started or closed';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'EVENT_STARTED', null, null, _observed_at,
    true, _observed_at, btrim(_observer_note), null, '{}'::jsonb, _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.observed.started',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'observed', true, 'runtime_state', 'running');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.observed.start', _key, _out);
  return _out;
end; $$;

create or replace function public.record_observed_event_completed(
  _event_id uuid, _observed_at timestamptz, _observer_note text, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  perform app_private.w07_assert_event_external(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.observed.complete', _key);
  if _out is not null then return _out; end if;
  if _observed_at is null or nullif(btrim(coalesce(_observer_note,'')),'') is null then
    raise exception 'Recording an observation requires the observed time and an observer note';
  end if;
  perform app_private.assert_generic_note(btrim(_observer_note));
  if app_private.w07_derived_event_runtime_state(_event_id) <> 'running' then
    raise exception 'Record the observed start before the observed completion';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'EVENT_COMPLETED', null, null, _observed_at,
    true, _observed_at, btrim(_observer_note), null, '{}'::jsonb, _key);
  perform app_private.w07_close_out_event(_event_id);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.observed.completed',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'observed', true,
    'runtime_state', 'completed', 'status', 'closed_out');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.observed.complete', _key, _out);
  return _out;
end; $$;

create or replace function public.record_observed_session_started(
  _session_id uuid, _observed_at timestamptz, _observer_note text, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_s.event_id);
  perform app_private.w07_assert_event_external(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.observed.session.start', _key);
  if _out is not null then return _out; end if;
  if _observed_at is null or nullif(btrim(coalesce(_observer_note,'')),'') is null then
    raise exception 'Recording an observation requires the observed time and an observer note';
  end if;
  perform app_private.assert_generic_note(btrim(_observer_note));
  if app_private.w07_derived_session_runtime_state(_session_id) <> 'scheduled' then
    raise exception 'This session has already been observed as started or closed';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'SESSION_STARTED', _session_id, _s.venue_space_id,
    _observed_at, true, _observed_at, btrim(_observer_note), null, '{}'::jsonb, _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.observed.session.started',
    'event_session', _session_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('session_id', _session_id, 'observed', true, 'runtime_state', 'running');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.observed.session.start', _key, _out);
  return _out;
end; $$;

create or replace function public.record_observed_session_completed(
  _session_id uuid, _observed_at timestamptz, _observer_note text, _idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _s public.event_sessions; _ev public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _s from public.event_sessions x where x.id = _session_id;
  if _s.id is null then raise exception 'Session not found'; end if;
  _ev := app_private.w07_require_event_runtime_write(_s.event_id);
  perform app_private.w07_assert_event_external(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.observed.session.complete', _key);
  if _out is not null then return _out; end if;
  if _observed_at is null or nullif(btrim(coalesce(_observer_note,'')),'') is null then
    raise exception 'Recording an observation requires the observed time and an observer note';
  end if;
  perform app_private.assert_generic_note(btrim(_observer_note));
  if app_private.w07_derived_session_runtime_state(_session_id) <> 'running' then
    raise exception 'Record the observed start before the observed completion';
  end if;
  perform app_private.w07_record_runtime_event(_ev, 'SESSION_COMPLETED', _session_id, _s.venue_space_id,
    _observed_at, true, _observed_at, btrim(_observer_note), null, '{}'::jsonb, _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.observed.session.completed',
    'event_session', _session_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('session_id', _session_id, 'observed', true, 'runtime_state', 'completed');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.observed.session.complete', _key, _out);
  return _out;
end; $$;

create or replace function public.record_event_note(
  _event_id uuid, _note text, _idempotency_key text, _session_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _id uuid;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.note', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_note,'')),'') is null then raise exception 'A note is required'; end if;
  perform app_private.assert_generic_note(btrim(_note));
  if _session_id is not null then
    perform app_private.w07_assert_session_in_event(_session_id, _event_id);
  end if;
  _id := app_private.w07_record_runtime_event(_ev, 'EVENT_NOTE_RECORDED', _session_id, null,
    null, false, null, null, btrim(_note), '{}'::jsonb, _key);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.note.recorded',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'runtime_event_id', _id);
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.note', _key, _out);
  return _out;
end; $$;

-- =============================== W07 READ FUNCTIONS (36-39) =================
create or replace function public.get_event_runtime_state(_event_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _sessions jsonb;
begin
  _ev := app_private.w07_require_event_write(_event_id);
  select coalesce(jsonb_agg(x order by x->>'sequence'), '[]'::jsonb) into _sessions from (
    select jsonb_build_object(
      'session_id', s.id, 'sequence', s.sequence, 'title', s.title,
      'is_ad_hoc', s.is_ad_hoc, 'venue_space_id', s.venue_space_id,
      'runtime_state', app_private.w07_derived_session_runtime_state(s.id)) as x
    from public.event_sessions s where s.event_id = _event_id) q;
  return jsonb_build_object(
    'event_id', _ev.id, 'status', _ev.status, 'source_kind', _ev.source_kind,
    'runtime_state', app_private.w07_derived_event_runtime_state(_event_id),
    'sessions', _sessions);
end; $$;

create or replace function public.get_event_program(_event_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _rows jsonb;
begin
  _ev := app_private.w07_require_event_write(_event_id);
  select coalesce(jsonb_agg(x order by x->>'sequence'), '[]'::jsonb) into _rows from (
    select jsonb_build_object(
      'session_id', s.id, 'sequence', s.sequence, 'title', s.title,
      'description', s.description, 'session_kind', s.session_kind,
      'is_ad_hoc', s.is_ad_hoc, 'ad_hoc_reason', s.ad_hoc_reason,
      'venue_space_id', s.venue_space_id,
      'planned_start', s.planned_start, 'planned_end', s.planned_end,
      'expected_start', s.expected_start, 'expected_end', s.expected_end,
      'runtime_state', app_private.w07_derived_session_runtime_state(s.id)) as x
    from public.event_sessions s where s.event_id = _event_id) q;
  return jsonb_build_object('event_id', _ev.id, 'status', _ev.status,
    'program_locked', _ev.status in ('program_locked','ready','closed_out'), 'sessions', _rows);
end; $$;

create or replace function public.get_venue_space_availability(
  _venue_id uuid, _from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _venue public.venues; _rows jsonb;
begin
  select * into _venue from public.venues v where v.id = _venue_id;
  if _venue.id is null then raise exception 'Venue not found'; end if;
  if not app_private.has_tenant_role(_venue.tenant_id,
       array['owner','admin','operations_agent']::public.app_role[])
    then raise exception 'You do not have permission for event production in this organization'; end if;
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into _rows from (
    select jsonb_build_object(
      'venue_space_id', sp.id, 'name', sp.name, 'is_active', sp.is_active,
      'planning_capacity', sp.planning_capacity,
      'bookings', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'session_id', s.id, 'event_id', s.event_id, 'title', s.title,
          'start', coalesce(s.expected_start, s.planned_start),
          'end', coalesce(s.expected_end, s.planned_end))), '[]'::jsonb)
        from public.event_sessions s
        where s.venue_space_id = sp.id
          and coalesce(s.expected_start, s.planned_start) < _to
          and coalesce(s.expected_end, s.planned_end) > _from)) as x
    from public.venue_spaces sp where sp.venue_id = _venue_id) q;
  return jsonb_build_object('venue_id', _venue_id, 'from', _from, 'to', _to, 'spaces', _rows);
end; $$;

create or replace function public.list_event_runtime_events(_event_id uuid, _limit integer default 200)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _ev public.events; _rows jsonb;
begin
  _ev := app_private.w07_require_event_write(_event_id);
  select coalesce(jsonb_agg(x), '[]'::jsonb) into _rows from (
    select jsonb_build_object(
      'id', r.id, 'event_type', r.event_type, 'session_id', r.session_id,
      'venue_space_id', r.venue_space_id, 'observed', r.observed,
      'observed_at', r.observed_at, 'observer_note', r.observer_note,
      'occurred_at', r.occurred_at, 'recorded_at', r.recorded_at,
      'note', r.note, 'context', r.context, 'actor_profile_id', r.actor_profile_id) as x
    from public.event_runtime_events r
    where r.event_id = _event_id
    order by r.occurred_at desc, r.created_at desc
    limit greatest(1, least(coalesce(_limit, 200), 500))) q;
  return jsonb_build_object('event_id', _event_id, 'facts', _rows);
end; $$;

-- ======================= PUBLIC FUNCTION EXECUTE ACLs =======================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in (
                'create_venue','update_venue','create_venue_space','update_venue_space',
                'create_event','update_event','submit_event_planning','lock_event_program',
                'reopen_event_program','mark_event_ready','set_event_expected_window',
                'link_event_journey_step','create_event_session','update_event_session',
                'reorder_event_sessions','create_ad_hoc_session','set_session_expected_window',
                'assign_session_speaker','remove_session_speaker','assign_event_staff',
                'remove_event_staff','start_event','complete_event','cancel_event',
                'start_session','pause_session','resume_session','complete_session',
                'cancel_session','change_session_space','record_observed_event_started',
                'record_observed_event_completed','record_observed_session_started',
                'record_observed_session_completed','record_event_note',
                'get_event_runtime_state','get_event_program','get_venue_space_availability',
                'list_event_runtime_events') loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;