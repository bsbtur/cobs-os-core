-- W07 HOTFIX OBS-W07-001 — internal event completion requires session reconciliation.
-- One additional PRIVATE helper only. No new public function, table, enum or event type.

CREATE OR REPLACE FUNCTION app_private.w07_session_resolution_summary(_event_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  with states as (
    select app_private.w07_derived_session_runtime_state(s.id) as st
      from public.event_sessions s
     where s.event_id = _event_id
  )
  select jsonb_build_object(
    'total_sessions',      count(*),
    'completed_sessions',  count(*) filter (where st = 'completed'),
    'cancelled_sessions',  count(*) filter (where st = 'cancelled'),
    'scheduled_sessions',  count(*) filter (where st = 'scheduled'),
    'running_sessions',    count(*) filter (where st = 'running'),
    'paused_sessions',     count(*) filter (where st = 'paused'),
    'unresolved_total',    count(*) filter (where st in ('scheduled','running','paused'))
  )
  from states;
$function$;

REVOKE ALL ON FUNCTION app_private.w07_session_resolution_summary(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_event(_event_id uuid, _idempotency_key text, _occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _ev public.events; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb; _sum jsonb;
begin
  _ev := app_private.w07_require_event_runtime_write(_event_id);
  perform app_private.w07_assert_event_internal(_ev);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('event.complete', _key);
  if _out is not null then return _out; end if;
  if app_private.w07_derived_event_runtime_state(_event_id) <> 'running' then
    raise exception 'Only a running event can be completed';
  end if;

  -- OBS-W07-001: every session must derive to a terminal state before the event closes.
  -- No auto-cancel, no auto-complete, no fabricated runtime facts: the operator resolves each one.
  _sum := app_private.w07_session_resolution_summary(_event_id);
  if (_sum->>'unresolved_total')::int > 0 then
    raise exception 'Resolve every session (complete or cancel) before completing the event'
      using detail = _sum::text, errcode = 'P0001';
  end if;

  perform app_private.w07_record_runtime_event(_ev, 'EVENT_COMPLETED', null, null, _occurred_at,
    false, null, null, _note, '{}'::jsonb, _key);
  perform app_private.w07_close_out_event(_event_id);
  perform app_private.record_audit_event(_ev.tenant_id, auth.uid(), 'event.completed',
    'event', _event_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('event_id', _event_id, 'runtime_state', 'completed', 'status', 'closed_out');
  perform app_private.w06_claim_key(_ev.tenant_id, 'event.complete', _key, _out);
  return _out;
end; $function$;