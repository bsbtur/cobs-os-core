create or replace function public.set_return_time(
  _transport_leg_id uuid, _return_time timestamptz, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _leg public.transport_legs; _id uuid; _clean text := nullif(btrim(coalesce(_note,'')),'');
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if _return_time is null then raise exception 'A return time is required'; end if;
  perform app_private.assert_generic_note(_clean);

  -- DEF-003: identical rendezvous value is a no-op; never append a duplicate fact.
  if _leg.return_time is not null and _leg.return_time = _return_time then
    return jsonb_build_object('transport_leg_id', _leg.id, 'return_time', _leg.return_time,
                              'unchanged', true);
  end if;

  -- DEF-002: changing an agreed rendezvous requires an explicit reason.
  if _leg.return_time is not null and _clean is null then
    raise exception 'A reason is required to change the agreed return time';
  end if;

  -- RETURN TIME IS A RENDEZVOUS INSTRUCTION: it never touches planned/expected windows.
  perform set_config('app.w05_control','on', true);
  update public.transport_legs set return_time = _return_time, return_time_note = _clean
    where id = _leg.id;
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, 'RETURN_TIME_SET', auth.uid(), now(), _clean,
    jsonb_build_object('previous_return_time', _leg.return_time, 'return_time', _return_time),
    gen_random_uuid()::text)
  returning id into _id;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.return_time_set',
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_return_time', _leg.return_time, 'return_time', _return_time));
  return jsonb_build_object('transport_leg_id', _leg.id, 'return_time', _return_time,
                            'transport_event_id', _id, 'unchanged', false);
end;
$$;

revoke all on function public.set_return_time(uuid, timestamptz, text) from public, anon;
grant execute on function public.set_return_time(uuid, timestamptz, text) to authenticated;