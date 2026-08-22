create or replace function public.release_seat(_seat_assignment_id uuid, _reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _row public.transport_seat_assignments; _leg public.transport_legs;
  _why text := nullif(btrim(coalesce(_reason,'')),'');
begin
  select * into _row from public.transport_seat_assignments a where a.id = _seat_assignment_id;
  if _row.id is null then raise exception 'Seat assignment not found'; end if;
  _leg := app_private.w05_leg(_row.transport_leg_id);
  perform app_private.assert_operation_not_closed(_leg.operation_id);
  if _why is null then raise exception 'A reason is required to release a seat'; end if;
  perform app_private.assert_generic_note(_why);
  if _row.released_at is not null then
    return jsonb_build_object('seat_assignment_id', _row.id, 'unchanged', true);
  end if;
  if app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    raise exception 'Seats cannot be released after the leg departed. Create a new ad-hoc leg instead.';
  end if;
  perform set_config('app.w05_control','on', true);
  update public.transport_seat_assignments
    set released_at = now(), released_by = auth.uid(), release_reason = _why
    where id = _row.id;
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, 'SEAT_RELEASED', auth.uid(), now(), _why,
    jsonb_build_object('participation_id', _row.participation_id, 'seat_label', _row.seat_label,
                       'seat_assignment_id', _row.id, 'cause', 'manual_release'),
    gen_random_uuid()::text);
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.seat_released',
    'transport_seat_assignment', _row.id, null,
    jsonb_build_object('transport_leg_id', _leg.id, 'participation_id', _row.participation_id,
                       'seat_label', _row.seat_label, 'reason', _why));
  return jsonb_build_object('seat_assignment_id', _row.id, 'released', true);
end;
$function$;

create or replace function public.remove_transport_leg_stop(_transport_leg_stop_id uuid, _reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _stop public.transport_leg_stops; _leg public.transport_legs;
  _why text := nullif(btrim(coalesce(_reason,'')),'');
begin
  select * into _stop from public.transport_leg_stops s where s.id = _transport_leg_stop_id;
  if _stop.id is null then raise exception 'Transport stop not found'; end if;
  _leg := app_private.w05_leg(_stop.transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  if _why is null then raise exception 'A reason is required to remove a stop'; end if;
  perform app_private.assert_generic_note(_why);
  if exists (select 1 from public.transport_events e where e.transport_leg_stop_id = _stop.id and e.event_type = 'STOP_REACHED') then
    raise exception 'A stop that was already reached cannot be removed';
  end if;
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.stop_removed',
    'transport_leg_stop', _stop.id, null,
    jsonb_build_object('transport_leg_id', _leg.id, 'label', _stop.label,
                       'sequence', _stop.sequence, 'reason', _why));
  perform set_config('app.w05_control','on', true);
  delete from public.transport_leg_stops where id = _stop.id;
  perform set_config('app.w05_control','off', true);
  return jsonb_build_object('transport_leg_stop_id', _stop.id, 'removed', true);
end;
$function$;

create or replace function public.update_transport_leg_stop(_transport_leg_stop_id uuid, _label text default null, _is_pickup boolean default null, _planned_time timestamptz default null, _expected_time timestamptz default null, _notes text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _stop public.transport_leg_stops; _leg public.transport_legs;
begin
  select * into _stop from public.transport_leg_stops s where s.id = _transport_leg_stop_id;
  if _stop.id is null then raise exception 'Transport stop not found'; end if;
  _leg := app_private.w05_leg(_stop.transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  if exists (select 1 from public.transport_events e where e.transport_leg_stop_id = _stop.id and e.event_type = 'STOP_REACHED') then
    raise exception 'A stop that was already reached cannot be rewritten';
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));
  perform set_config('app.w05_control','on', true);
  update public.transport_leg_stops set
    label = coalesce(nullif(btrim(coalesce(_label,'')),''), label),
    is_pickup = coalesce(_is_pickup, is_pickup),
    planned_time = coalesce(_planned_time, planned_time),
    expected_time = coalesce(_expected_time, expected_time),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes)
  where id = _stop.id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.stop_updated',
    'transport_leg_stop', _stop.id, null, jsonb_build_object('transport_leg_id', _leg.id));
  return jsonb_build_object('transport_leg_stop_id', _stop.id);
end;
$function$;

create or replace function public.set_return_time(_transport_leg_id uuid, _return_time timestamptz, _note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _leg public.transport_legs; _id uuid; _clean text := nullif(btrim(coalesce(_note,'')),'');
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.assert_operation_not_closed(_leg.operation_id);
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if _return_time is null then raise exception 'A return time is required'; end if;
  perform app_private.assert_generic_note(_clean);
  if _leg.return_time is not null and _leg.return_time = _return_time then
    return jsonb_build_object('transport_leg_id', _leg.id, 'return_time', _leg.return_time, 'unchanged', true);
  end if;
  if _leg.return_time is not null and _clean is null then
    raise exception 'A reason is required to change the agreed return time';
  end if;
  perform set_config('app.w05_control','on', true);
  update public.transport_legs set return_time = _return_time, return_time_note = _clean where id = _leg.id;
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, 'RETURN_TIME_SET', auth.uid(), now(), _clean,
    jsonb_build_object('previous_return_time', _leg.return_time, 'return_time', _return_time), gen_random_uuid()::text)
  returning id into _id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.return_time_set',
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_return_time', _leg.return_time, 'return_time', _return_time));
  return jsonb_build_object('transport_leg_id', _leg.id, 'return_time', _return_time,
                            'transport_event_id', _id, 'unchanged', false);
end;
$function$;