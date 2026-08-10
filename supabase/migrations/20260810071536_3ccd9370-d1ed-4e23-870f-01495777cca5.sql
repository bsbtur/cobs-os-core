-- One transaction · release + assign · two events · one typed correlation_id.
create or replace function public.change_room(
  _stay_participation_id uuid, _room_id uuid, _reason text, _idempotency_key text,
  _allow_overcapacity boolean default false)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _g public.hospitality_stay_participations; _stay public.hospitality_stays;
  _room public.hospitality_rooms; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _out jsonb;
  _occupied integer; _old uuid; _old_room uuid; _new uuid; _corr text := gen_random_uuid()::text;
  _over boolean;
begin
  _g := app_private.w06_stay_participation(_stay_participation_id);
  _stay := app_private.w06_stay(_g.stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.room.change', _key);
  if _out is not null then return _out; end if;
  if not _g.is_active then raise exception 'This guest is not on the active stay manifest'; end if;
  if _why is null then raise exception 'A reason is required to move a guest'; end if;
  perform app_private.assert_generic_note(_why);

  select a.id, a.room_id into _old, _old_room from public.hospitality_room_assignments a
   where a.stay_participation_id = _g.id and a.released_at is null;
  if _old is null then raise exception 'This guest has no room yet. Assign a room instead.'; end if;

  select * into _room from public.hospitality_rooms r
   where r.id = _room_id and r.stay_id = _stay.id for update;
  if _room.id is null then raise exception 'Room not found in this stay'; end if;
  if _room.id = _old_room then
    _out := jsonb_build_object('stay_participation_id', _g.id, 'room_id', _room.id, 'unchanged', true);
    perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.room.change', _key, _out);
    return _out;
  end if;
  if _room.room_status = 'blocked' then raise exception 'This room is blocked'; end if;

  _occupied := app_private.w06_room_occupancy(_room.id);
  _over := _occupied >= _room.capacity;
  if _over then
    if not coalesce(_allow_overcapacity, false) then
      raise exception 'Room % is full (% of %)', _room.label, _occupied, _room.capacity;
    end if;
    perform app_private.w06_assert_override_role(_stay.tenant_id);
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_room_assignments
     set released_at = now(), released_by = auth.uid(), release_reason = _why,
         correlation_id = _corr
   where id = _old;
  insert into public.hospitality_room_assignments
    (tenant_id, stay_id, room_id, stay_participation_id, assigned_by,
     overcapacity_override, override_reason, correlation_id)
  values (_stay.tenant_id, _stay.id, _room.id, _g.id, auth.uid(),
          _over, case when _over then _why end, _corr)
  returning id into _new;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'ROOM_RELEASED', _old_room, _g.id, _old,
    null, _why, '{}'::jsonb, _corr);
  perform app_private.record_hospitality_event(_stay, 'ROOM_ASSIGNED', _room.id, _g.id, _new,
    null, _why, jsonb_build_object('overcapacity', _over), _corr);
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.room.changed',
    'hospitality_room_assignment', _new, _key,
    jsonb_build_object('from_room_id', _old_room, 'to_room_id', _room.id, 'reason', _why,
                       'overcapacity', _over, 'correlation_id', _corr));
  _out := jsonb_build_object('room_assignment_id', _new, 'room_id', _room.id,
                             'released_assignment_id', _old, 'correlation_id', _corr,
                             'unchanged', false);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.room.change', _key, _out);
  return _out;
end;
$$;

-- =====================================================================
-- COMMANDS · GUEST RUNTIME — state derived only from events
-- =====================================================================
create or replace function public.record_guest_checked_in(
  _stay_participation_id uuid, _idempotency_key text,
  _occurred_at timestamptz default null, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _g public.hospitality_stay_participations; _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _state text; _room uuid; _assignment uuid;
begin
  _g := app_private.w06_stay_participation(_stay_participation_id);
  _stay := app_private.w06_stay(_g.stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.guest.checkin', _key);
  if _out is not null then return _out; end if;
  perform app_private.w06_assert_open(_stay);
  if _stay.status <> 'active' or _stay.checkin_opened_at is null then
    raise exception 'Check-in is not open for this stay';
  end if;
  if _stay.checkout_completed_at is not null then
    raise exception 'This stay has already completed its check-out';
  end if;
  if not _g.is_active then raise exception 'This guest is not on the active stay manifest'; end if;

  _state := app_private.w06_guest_state(_g.id);
  if _state = 'CHECKED_IN' then
    _out := jsonb_build_object('stay_participation_id', _g.id, 'state', 'CHECKED_IN', 'unchanged', true);
    perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.guest.checkin', _key, _out);
    return _out;
  end if;
  if _state = 'CHECKED_OUT' then raise exception 'This guest already checked out'; end if;
  if _state = 'NO_SHOW' then raise exception 'This guest was recorded as a no-show'; end if;

  select a.id, a.room_id into _assignment, _room from public.hospitality_room_assignments a
   where a.stay_participation_id = _g.id and a.released_at is null;
  if _assignment is null then raise exception 'Assign a room before checking this guest in'; end if;

  perform app_private.record_hospitality_event(_stay, 'GUEST_CHECKED_IN', _room, _g.id, _assignment,
    _occurred_at, _note);
  perform app_private.record_audit_event(_g.tenant_id, auth.uid(), 'hospitality.guest.checked_in',
    'hospitality_stay_participation', _g.id, _key, jsonb_build_object('room_id', _room));
  _out := jsonb_build_object('stay_participation_id', _g.id, 'state', 'CHECKED_IN', 'unchanged', false);
  perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.guest.checkin', _key, _out);
  return _out;
end;
$$;

create or replace function public.record_guest_checked_out(
  _stay_participation_id uuid, _idempotency_key text,
  _occurred_at timestamptz default null, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _g public.hospitality_stay_participations; _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _state text; _room uuid; _assignment uuid;
begin
  _g := app_private.w06_stay_participation(_stay_participation_id);
  _stay := app_private.w06_stay(_g.stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.guest.checkout', _key);
  if _out is not null then return _out; end if;
  perform app_private.w06_assert_open(_stay);

  _state := app_private.w06_guest_state(_g.id);
  if _state = 'CHECKED_OUT' then
    _out := jsonb_build_object('stay_participation_id', _g.id, 'state', 'CHECKED_OUT', 'unchanged', true);
    perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.guest.checkout', _key, _out);
    return _out;
  end if;
  if _state <> 'CHECKED_IN' then
    raise exception 'This guest never checked in';
  end if;

  select a.id, a.room_id into _assignment, _room from public.hospitality_room_assignments a
   where a.stay_participation_id = _g.id and a.released_at is null;

  perform app_private.record_hospitality_event(_stay, 'GUEST_CHECKED_OUT', _room, _g.id, _assignment,
    _occurred_at, _note);
  perform app_private.record_audit_event(_g.tenant_id, auth.uid(), 'hospitality.guest.checked_out',
    'hospitality_stay_participation', _g.id, _key, jsonb_build_object('room_id', _room));
  _out := jsonb_build_object('stay_participation_id', _g.id, 'state', 'CHECKED_OUT', 'unchanged', false);
  perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.guest.checkout', _key, _out);
  return _out;
end;
$$;

-- Hospitality outcome only. Never writes W03 roster or W04 presence.
create or replace function public.record_guest_no_show(
  _stay_participation_id uuid, _reason text, _idempotency_key text,
  _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _g public.hospitality_stay_participations; _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _out jsonb; _state text;
begin
  _g := app_private.w06_stay_participation(_stay_participation_id);
  _stay := app_private.w06_stay(_g.stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.guest.no_show', _key);
  if _out is not null then return _out; end if;
  perform app_private.w06_assert_open(_stay);
  if _why is null then raise exception 'A reason is required to record a hospitality no-show'; end if;
  perform app_private.assert_generic_note(_why);

  _state := app_private.w06_guest_state(_g.id);
  if _state = 'NO_SHOW' then
    _out := jsonb_build_object('stay_participation_id', _g.id, 'state', 'NO_SHOW', 'unchanged', true);
    perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.guest.no_show', _key, _out);
    return _out;
  end if;
  if _state <> 'NOT_ARRIVED' then
    raise exception 'A no-show can only be recorded before the guest checks in';
  end if;

  perform app_private.record_hospitality_event(_stay, 'GUEST_NO_SHOW_RECORDED', null, _g.id, null,
    _occurred_at, _why);
  perform app_private.record_audit_event(_g.tenant_id, auth.uid(), 'hospitality.guest.no_show',
    'hospitality_stay_participation', _g.id, _key, jsonb_build_object('reason', _why));
  _out := jsonb_build_object('stay_participation_id', _g.id, 'state', 'NO_SHOW', 'unchanged', false);
  perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.guest.no_show', _key, _out);
  return _out;
end;
$$;

-- =====================================================================
-- COMMAND · ISSUES
-- =====================================================================
create or replace function public.note_hospitality_issue(
  _stay_id uuid, _note text, _idempotency_key text,
  _room_id uuid default null, _stay_participation_id uuid default null,
  _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _text text := nullif(btrim(coalesce(_note,'')),''); _out jsonb; _event uuid;
begin
  _stay := app_private.w06_stay(_stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.issue.note', _key);
  if _out is not null then return _out; end if;
  if _text is null then raise exception 'Describe the issue'; end if;
  perform app_private.assert_generic_note(_text);
  if _room_id is not null then
    perform 1 from public.hospitality_rooms r where r.id = _room_id and r.stay_id = _stay.id;
    if not found then raise exception 'Room not found in this stay'; end if;
  end if;
  if _stay_participation_id is not null then
    perform 1 from public.hospitality_stay_participations g
      where g.id = _stay_participation_id and g.stay_id = _stay.id;
    if not found then raise exception 'Guest not found in this stay'; end if;
  end if;

  _event := app_private.record_hospitality_event(_stay, 'HOSPITALITY_ISSUE_NOTED', _room_id,
    _stay_participation_id, null, _occurred_at, _text);
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.issue.noted',
    'hospitality_event', _event, _key, '{}'::jsonb);
  _out := jsonb_build_object('hospitality_event_id', _event, 'stay_id', _stay.id);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.issue.note', _key, _out);
  return _out;
end;
$$;

-- =====================================================================
-- READ FUNCTIONS
-- =====================================================================
create or replace function public.w06_stay_overview(_stay_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _prop public.hospitality_properties; _counts jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  select * into _prop from public.hospitality_properties p where p.id = _stay.property_id;
  select jsonb_build_object(
    'guests', count(*) filter (where g.is_active),
    'removed', count(*) filter (where not g.is_active),
    'with_room', count(*) filter (where g.is_active and exists (
        select 1 from public.hospitality_room_assignments a
         where a.stay_participation_id = g.id and a.released_at is null)),
    'without_room', count(*) filter (where g.is_active and not exists (
        select 1 from public.hospitality_room_assignments a
         where a.stay_participation_id = g.id and a.released_at is null)),
    'checked_in', count(*) filter (where g.is_active and app_private.w06_guest_state(g.id) = 'CHECKED_IN'),
    'checked_out', count(*) filter (where g.is_active and app_private.w06_guest_state(g.id) = 'CHECKED_OUT'),
    'no_show', count(*) filter (where g.is_active and app_private.w06_guest_state(g.id) = 'NO_SHOW'),
    'pending_checkin', count(*) filter (where g.is_active and app_private.w06_guest_state(g.id) = 'NOT_ARRIVED')
  ) into _counts
  from public.hospitality_stay_participations g where g.stay_id = _stay.id;

  return jsonb_build_object(
    'stay_id', _stay.id, 'tenant_id', _stay.tenant_id, 'operation_id', _stay.operation_id,
    'name', _stay.name, 'status', _stay.status,
    'planned_check_in', _stay.planned_check_in, 'planned_check_out', _stay.planned_check_out,
    'expected_check_in', _stay.expected_check_in, 'expected_check_out', _stay.expected_check_out,
    'checkin_opened_at', _stay.checkin_opened_at,
    'checkout_completed_at', _stay.checkout_completed_at,
    'completed_at', _stay.completed_at, 'cancelled_at', _stay.cancelled_at,
    'cancellation_reason', _stay.cancellation_reason, 'notes', _stay.notes,
    'property', jsonb_build_object('property_id', _prop.id, 'name', _prop.name,
      'property_kind', _prop.property_kind, 'city', _prop.city, 'region', _prop.region,
      'country_code', _prop.country_code, 'address_label', _prop.address_label,
      'contact_label', _prop.contact_label),
    'counts', coalesce(_counts, '{}'::jsonb),
    'issues', (select count(*) from public.hospitality_events e
                where e.stay_id = _stay.id and e.event_type = 'HOSPITALITY_ISSUE_NOTED'));
end;
$$;

create or replace function public.w06_stay_rooming(_stay_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _rooms jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'room_id', r.id, 'label', r.label, 'capacity', r.capacity,
      'room_status', r.room_status, 'floor_label', r.floor_label, 'notes', r.notes,
      'occupancy', app_private.w06_room_occupancy(r.id),
      'guests', (select coalesce(jsonb_agg(jsonb_build_object(
                    'stay_participation_id', g.id,
                    'participation_id', g.participation_id,
                    'full_name', pe.full_name,
                    'room_assignment_id', a.id,
                    'assigned_at', a.assigned_at,
                    'state', app_private.w06_guest_state(g.id)) order by pe.full_name), '[]'::jsonb)
                  from public.hospitality_room_assignments a
                  join public.hospitality_stay_participations g on g.id = a.stay_participation_id
                  join public.operation_participations op on op.id = g.participation_id
                  join public.people pe on pe.id = op.person_id
                  where a.room_id = r.id and a.released_at is null)
    ) order by lower(r.label)), '[]'::jsonb)
    into _rooms from public.hospitality_rooms r where r.stay_id = _stay.id;
  return jsonb_build_object('stay_id', _stay.id, 'rooms', _rooms);
end;
$$;

create or replace function public.w06_stay_guests(_stay_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _rows jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'stay_participation_id', g.id, 'participation_id', g.participation_id,
      'full_name', pe.full_name, 'participation_kind', op.participation_kind,
      'participation_status', op.status,
      'is_active', g.is_active, 'removal_reason', g.removal_reason,
      'state', app_private.w06_guest_state(g.id),
      'room_id', a.room_id, 'room_label', r.label, 'room_assignment_id', a.id
    ) order by g.is_active desc, pe.full_name), '[]'::jsonb)
    into _rows
    from public.hospitality_stay_participations g
    join public.operation_participations op on op.id = g.participation_id
    join public.people pe on pe.id = op.person_id
    left join public.hospitality_room_assignments a
      on a.stay_participation_id = g.id and a.released_at is null
    left join public.hospitality_rooms r on r.id = a.room_id
   where g.stay_id = _stay.id;
  return jsonb_build_object('stay_id', _stay.id, 'guests', _rows);
end;
$$;

create or replace function public.w06_operation_hospitality(_operation_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _op public.operations; _stays jsonb;
begin
  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  perform app_private.w06_assert_role(_op.tenant_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'stay_id', s.id, 'name', s.name, 'status', s.status,
      'property_name', p.name, 'property_kind', p.property_kind, 'city', p.city,
      'planned_check_in', s.planned_check_in, 'planned_check_out', s.planned_check_out,
      'expected_check_in', s.expected_check_in, 'expected_check_out', s.expected_check_out,
      'rooms', (select count(*) from public.hospitality_rooms r where r.stay_id = s.id),
      'guests', (select count(*) from public.hospitality_stay_participations g
                  where g.stay_id = s.id and g.is_active),
      'with_room', (select count(*) from public.hospitality_stay_participations g
                     where g.stay_id = s.id and g.is_active
                       and exists (select 1 from public.hospitality_room_assignments a
                                    where a.stay_participation_id = g.id and a.released_at is null)),
      'checked_in', (select count(*) from public.hospitality_stay_participations g
                      where g.stay_id = s.id and g.is_active
                        and app_private.w06_guest_state(g.id) = 'CHECKED_IN'),
      'issues', (select count(*) from public.hospitality_events e
                  where e.stay_id = s.id and e.event_type = 'HOSPITALITY_ISSUE_NOTED')
    ) order by s.planned_check_in), '[]'::jsonb)
    into _stays
    from public.hospitality_stays s
    join public.hospitality_properties p on p.id = s.property_id
   where s.operation_id = _op.id;
  return jsonb_build_object('operation_id', _op.id, 'stays', _stays);
end;
$$;

-- =====================================================================
-- EXECUTE SURFACE — signed-in users only, never anon
-- =====================================================================
do $$
declare _sig text;
begin
  for _sig in
    select format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'w06\_%'
            or p.proname in ('create_hospitality_property','update_hospitality_property',
              'set_hospitality_property_active','create_hospitality_stay','update_hospitality_stay',
              'set_stay_planned_window','set_stay_expected_window','confirm_hospitality_stay',
              'open_stay_checkin','complete_stay_checkout','complete_hospitality_stay',
              'cancel_hospitality_stay','create_hospitality_room','update_hospitality_room',
              'block_hospitality_room','unblock_hospitality_room','add_stay_participation',
              'remove_stay_participation','restore_stay_participation','assign_room','release_room',
              'change_room','record_guest_checked_in','record_guest_checked_out','record_guest_no_show',
              'note_hospitality_issue'))
  loop
    execute format('revoke all on function %s from public, anon', _sig);
    execute format('grant execute on function %s to authenticated', _sig);
  end loop;
end;
$$;

-- =====================================================================
-- REALTIME — exactly two tables
-- =====================================================================
alter table public.hospitality_events replica identity full;
alter table public.hospitality_rooms replica identity full;
alter publication supabase_realtime add table public.hospitality_events;
alter publication supabase_realtime add table public.hospitality_rooms;