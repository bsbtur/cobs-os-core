create or replace function public.block_hospitality_room(
  _room_id uuid, _reason text, _idempotency_key text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _room public.hospitality_rooms; _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _out jsonb;
begin
  _room := app_private.w06_room(_room_id);
  _stay := app_private.w06_stay(_room.stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.room.block', _key);
  if _out is not null then return _out; end if;
  if _room.room_status = 'blocked' then
    _out := jsonb_build_object('room_id', _room_id, 'room_status', 'blocked', 'unchanged', true);
    perform app_private.w06_claim_key(_room.tenant_id, 'hospitality.room.block', _key, _out);
    return _out;
  end if;
  if _why is null then raise exception 'A reason is required to block a room'; end if;
  perform app_private.assert_generic_note(_why);

  perform set_config('app.w06_control','on', true);
  update public.hospitality_rooms set room_status = 'blocked' where id = _room_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'ROOM_BLOCKED', _room_id, null, null, null, _why);
  perform app_private.record_audit_event(_room.tenant_id, auth.uid(), 'hospitality.room.blocked',
    'hospitality_room', _room_id, _key, jsonb_build_object('reason', _why));
  _out := jsonb_build_object('room_id', _room_id, 'room_status', 'blocked', 'unchanged', false);
  perform app_private.w06_claim_key(_room.tenant_id, 'hospitality.room.block', _key, _out);
  return _out;
end;
$$;

create or replace function public.unblock_hospitality_room(
  _room_id uuid, _idempotency_key text, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _room public.hospitality_rooms; _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _room := app_private.w06_room(_room_id);
  _stay := app_private.w06_stay(_room.stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.room.unblock', _key);
  if _out is not null then return _out; end if;
  if _room.room_status = 'available' then
    _out := jsonb_build_object('room_id', _room_id, 'room_status', 'available', 'unchanged', true);
    perform app_private.w06_claim_key(_room.tenant_id, 'hospitality.room.unblock', _key, _out);
    return _out;
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_rooms set room_status = 'available' where id = _room_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'ROOM_UNBLOCKED', _room_id, null, null, null, _note);
  perform app_private.record_audit_event(_room.tenant_id, auth.uid(), 'hospitality.room.unblocked',
    'hospitality_room', _room_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('room_id', _room_id, 'room_status', 'available', 'unchanged', false);
  perform app_private.w06_claim_key(_room.tenant_id, 'hospitality.room.unblock', _key, _out);
  return _out;
end;
$$;

-- =====================================================================
-- COMMANDS · STAY PARTICIPATIONS — never hard-deleted
-- =====================================================================
create or replace function public.add_stay_participation(
  _stay_id uuid, _participation_id uuid, _idempotency_key text, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _p public.operation_participations;
  _row public.hospitality_stay_participations;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.guest.add', _key);
  if _out is not null then return _out; end if;

  select * into _p from public.operation_participations p
   where p.id = _participation_id and p.tenant_id = _stay.tenant_id
     and p.operation_id = _stay.operation_id;
  if _p.id is null then raise exception 'This person is not on the operation roster'; end if;
  if _p.status = 'cancelled' then raise exception 'This roster entry is cancelled'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  select * into _row from public.hospitality_stay_participations g
   where g.stay_id = _stay_id and g.participation_id = _participation_id;

  perform set_config('app.w06_control','on', true);
  if _row.id is null then
    insert into public.hospitality_stay_participations
      (tenant_id, stay_id, participation_id, notes, created_by)
    values (_stay.tenant_id, _stay.id, _participation_id,
            nullif(btrim(coalesce(_notes,'')),''), auth.uid())
    returning * into _row;
  elsif not _row.is_active then
    update public.hospitality_stay_participations
       set is_active = true, restored_at = now(), removed_at = null, removal_reason = null
     where id = _row.id returning * into _row;
  end if;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.guest.added',
    'hospitality_stay_participation', _row.id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_participation_id', _row.id, 'stay_id', _stay.id);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.guest.add', _key, _out);
  return _out;
end;
$$;

-- Removes from the ACTIVE manifest. History is never destroyed.
create or replace function public.remove_stay_participation(
  _stay_participation_id uuid, _reason text, _idempotency_key text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _g public.hospitality_stay_participations; _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _out jsonb; _assignment uuid; _room uuid;
begin
  _g := app_private.w06_stay_participation(_stay_participation_id);
  _stay := app_private.w06_stay(_g.stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.guest.remove', _key);
  if _out is not null then return _out; end if;
  if not _g.is_active then
    _out := jsonb_build_object('stay_participation_id', _g.id, 'unchanged', true);
    perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.guest.remove', _key, _out);
    return _out;
  end if;
  if _why is null then raise exception 'A reason is required to remove a guest from the stay'; end if;
  perform app_private.assert_generic_note(_why);
  if app_private.w06_guest_state(_g.id) = 'CHECKED_IN' then
    raise exception 'This guest is checked in. Record the check-out before removing them.';
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_room_assignments
     set released_at = now(), released_by = auth.uid(), release_reason = _why
   where stay_participation_id = _g.id and released_at is null
   returning id, room_id into _assignment, _room;
  update public.hospitality_stay_participations
     set is_active = false, removed_at = now(), removal_reason = _why
   where id = _g.id;
  perform set_config('app.w06_control','off', true);

  if _assignment is not null then
    perform app_private.record_hospitality_event(_stay, 'ROOM_RELEASED', _room, _g.id, _assignment,
      null, _why);
  end if;
  perform app_private.record_audit_event(_g.tenant_id, auth.uid(), 'hospitality.guest.removed',
    'hospitality_stay_participation', _g.id, _key, jsonb_build_object('reason', _why));
  _out := jsonb_build_object('stay_participation_id', _g.id, 'unchanged', false);
  perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.guest.remove', _key, _out);
  return _out;
end;
$$;

create or replace function public.restore_stay_participation(
  _stay_participation_id uuid, _idempotency_key text, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _g public.hospitality_stay_participations; _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _g := app_private.w06_stay_participation(_stay_participation_id);
  _stay := app_private.w06_stay(_g.stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.guest.restore', _key);
  if _out is not null then return _out; end if;
  if _g.is_active then
    _out := jsonb_build_object('stay_participation_id', _g.id, 'unchanged', true);
    perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.guest.restore', _key, _out);
    return _out;
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stay_participations
     set is_active = true, restored_at = now(), removed_at = null, removal_reason = null
   where id = _g.id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(_g.tenant_id, auth.uid(), 'hospitality.guest.restored',
    'hospitality_stay_participation', _g.id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_participation_id', _g.id, 'unchanged', false);
  perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.guest.restore', _key, _out);
  return _out;
end;
$$;

-- =====================================================================
-- COMMANDS · ROOM ASSIGNMENTS
-- =====================================================================
create or replace function public.assign_room(
  _stay_participation_id uuid, _room_id uuid, _idempotency_key text,
  _allow_overcapacity boolean default false, _reason text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _g public.hospitality_stay_participations; _stay public.hospitality_stays;
  _room public.hospitality_rooms; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _out jsonb;
  _occupied integer; _assignment uuid; _open uuid;
begin
  _g := app_private.w06_stay_participation(_stay_participation_id);
  _stay := app_private.w06_stay(_g.stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.room.assign', _key);
  if _out is not null then return _out; end if;
  if not _g.is_active then raise exception 'This guest is not on the active stay manifest'; end if;

  select * into _room from public.hospitality_rooms r
   where r.id = _room_id and r.stay_id = _stay.id for update;
  if _room.id is null then raise exception 'Room not found in this stay'; end if;
  if _room.room_status = 'blocked' then raise exception 'This room is blocked'; end if;

  select a.id into _open from public.hospitality_room_assignments a
   where a.stay_participation_id = _g.id and a.released_at is null;
  if _open is not null then
    raise exception 'This guest already has a room. Use the room change command instead.';
  end if;

  _occupied := app_private.w06_room_occupancy(_room.id);
  if _occupied >= _room.capacity then
    if not coalesce(_allow_overcapacity, false) then
      raise exception 'Room % is full (% of %)', _room.label, _occupied, _room.capacity;
    end if;
    perform app_private.w06_assert_override_role(_stay.tenant_id);
    if _why is null then raise exception 'A reason is required to exceed room capacity'; end if;
    perform app_private.assert_generic_note(_why);
  end if;

  perform set_config('app.w06_control','on', true);
  insert into public.hospitality_room_assignments
    (tenant_id, stay_id, room_id, stay_participation_id, assigned_by,
     overcapacity_override, override_reason, correlation_id)
  values (_stay.tenant_id, _stay.id, _room.id, _g.id, auth.uid(),
          _occupied >= _room.capacity, case when _occupied >= _room.capacity then _why end,
          gen_random_uuid()::text)
  returning id into _assignment;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'ROOM_ASSIGNED', _room.id, _g.id, _assignment,
    null, _why, jsonb_build_object('overcapacity', _occupied >= _room.capacity));
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.room.assigned',
    'hospitality_room_assignment', _assignment, _key,
    jsonb_build_object('room_id', _room.id, 'overcapacity', _occupied >= _room.capacity, 'reason', _why));
  _out := jsonb_build_object('room_assignment_id', _assignment, 'room_id', _room.id,
                             'stay_participation_id', _g.id);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.room.assign', _key, _out);
  return _out;
end;
$$;

create or replace function public.release_room(
  _stay_participation_id uuid, _reason text, _idempotency_key text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _g public.hospitality_stay_participations; _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _out jsonb;
  _assignment uuid; _room uuid;
begin
  _g := app_private.w06_stay_participation(_stay_participation_id);
  _stay := app_private.w06_stay(_g.stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.room.release', _key);
  if _out is not null then return _out; end if;
  if _why is null then raise exception 'A reason is required to release a room'; end if;
  perform app_private.assert_generic_note(_why);

  select a.id, a.room_id into _assignment, _room
    from public.hospitality_room_assignments a
   where a.stay_participation_id = _g.id and a.released_at is null;
  if _assignment is null then
    _out := jsonb_build_object('stay_participation_id', _g.id, 'unchanged', true);
    perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.room.release', _key, _out);
    return _out;
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_room_assignments
     set released_at = now(), released_by = auth.uid(), release_reason = _why
   where id = _assignment;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'ROOM_RELEASED', _room, _g.id, _assignment,
    null, _why);
  perform app_private.record_audit_event(_g.tenant_id, auth.uid(), 'hospitality.room.released',
    'hospitality_room_assignment', _assignment, _key, jsonb_build_object('reason', _why));
  _out := jsonb_build_object('stay_participation_id', _g.id, 'room_assignment_id', _assignment,
                             'unchanged', false);
  perform app_private.w06_claim_key(_g.tenant_id, 'hospitality.room.release', _key, _out);
  return _out;
end;
$$;