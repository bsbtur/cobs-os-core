create or replace function public.set_stay_planned_window(
  _stay_id uuid, _planned_check_in timestamptz, _planned_check_out timestamptz,
  _idempotency_key text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.planned', _key);
  if _out is not null then return _out; end if;
  if _stay.status <> 'draft' then
    raise exception 'The stay baseline is frozen once confirmed. Use the expected window instead.';
  end if;
  if _planned_check_out <= _planned_check_in then
    raise exception 'Check-out must be after check-in';
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays
     set planned_check_in = _planned_check_in, planned_check_out = _planned_check_out
   where id = _stay_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.stay.planned_window',
    'hospitality_stay', _stay_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_id', _stay_id);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.planned', _key, _out);
  return _out;
end;
$$;

create or replace function public.set_stay_expected_window(
  _stay_id uuid, _idempotency_key text,
  _expected_check_in timestamptz default null, _expected_check_out timestamptz default null,
  _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _in timestamptz; _out_at timestamptz;
begin
  _stay := app_private.w06_stay(_stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.expected', _key);
  if _out is not null then return _out; end if;

  _in := coalesce(_expected_check_in, _stay.expected_check_in);
  _out_at := coalesce(_expected_check_out, _stay.expected_check_out);
  if _in is not null and _out_at is not null and _out_at <= _in then
    raise exception 'The expected check-out must be after the expected check-in';
  end if;
  if _in is not distinct from _stay.expected_check_in
     and _out_at is not distinct from _stay.expected_check_out then
    _out := jsonb_build_object('stay_id', _stay_id, 'unchanged', true);
    perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.expected', _key, _out);
    return _out;
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays
     set expected_check_in = _in, expected_check_out = _out_at
   where id = _stay_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'STAY_FORECAST_UPDATED', null, null, null,
    null, _note, jsonb_build_object('expected_check_in', _in, 'expected_check_out', _out_at));
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.stay.forecast',
    'hospitality_stay', _stay_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_id', _stay_id, 'unchanged', false);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.expected', _key, _out);
  return _out;
end;
$$;

create or replace function public.confirm_hospitality_stay(
  _stay_id uuid, _idempotency_key text, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.confirm', _key);
  if _out is not null then return _out; end if;
  if _stay.status <> 'draft' then
    if _stay.status = 'confirmed' then
      _out := jsonb_build_object('stay_id', _stay_id, 'status', 'confirmed', 'unchanged', true);
      perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.confirm', _key, _out);
      return _out;
    end if;
    raise exception 'Only a draft stay can be confirmed';
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays set status = 'confirmed' where id = _stay_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'STAY_CONFIRMED', null, null, null, null, _note);
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.stay.confirmed',
    'hospitality_stay', _stay_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_id', _stay_id, 'status', 'confirmed', 'unchanged', false);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.confirm', _key, _out);
  return _out;
end;
$$;

create or replace function public.open_stay_checkin(
  _stay_id uuid, _idempotency_key text, _occurred_at timestamptz default null,
  _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.open_checkin', _key);
  if _out is not null then return _out; end if;
  if _stay.status = 'active' then
    _out := jsonb_build_object('stay_id', _stay_id, 'status', 'active', 'unchanged', true);
    perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.open_checkin', _key, _out);
    return _out;
  end if;
  if _stay.status <> 'confirmed' then
    raise exception 'Check-in can only be opened for a confirmed stay';
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays
     set status = 'active', checkin_opened_at = coalesce(_occurred_at, now())
   where id = _stay_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'STAY_CHECKIN_OPENED', null, null, null,
    _occurred_at, _note);
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.stay.checkin_opened',
    'hospitality_stay', _stay_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_id', _stay_id, 'status', 'active', 'unchanged', false);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.open_checkin', _key, _out);
  return _out;
end;
$$;

-- Operational declaration: the group has vacated the property.
create or replace function public.complete_stay_checkout(
  _stay_id uuid, _idempotency_key text, _occurred_at timestamptz default null,
  _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _pending integer;
begin
  _stay := app_private.w06_stay(_stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.checkout', _key);
  if _out is not null then return _out; end if;
  if _stay.checkout_completed_at is not null then
    _out := jsonb_build_object('stay_id', _stay_id, 'unchanged', true);
    perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.checkout', _key, _out);
    return _out;
  end if;
  if _stay.status <> 'active' then
    raise exception 'Only an active stay can complete its check-out';
  end if;

  select count(*) into _pending
    from public.hospitality_stay_participations g
   where g.stay_id = _stay_id and g.is_active
     and app_private.w06_guest_state(g.id) = 'CHECKED_IN';
  if _pending > 0 then
    raise exception 'A guest is still checked in. Check out every guest before closing the stay.';
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays
     set checkout_completed_at = coalesce(_occurred_at, now())
   where id = _stay_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'STAY_CHECKOUT_COMPLETED', null, null, null,
    _occurred_at, _note);
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.stay.checkout_completed',
    'hospitality_stay', _stay_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_id', _stay_id, 'unchanged', false);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.checkout', _key, _out);
  return _out;
end;
$$;

-- Business/lifecycle completion. Never fabricates checkout facts.
create or replace function public.complete_hospitality_stay(
  _stay_id uuid, _idempotency_key text, _note text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _open integer;
begin
  _stay := app_private.w06_stay(_stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.complete', _key);
  if _out is not null then return _out; end if;
  if _stay.status = 'completed' then
    _out := jsonb_build_object('stay_id', _stay_id, 'status', 'completed', 'unchanged', true);
    perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.complete', _key, _out);
    return _out;
  end if;
  if _stay.status <> 'active' then raise exception 'Only an active stay can be completed'; end if;
  if _stay.checkout_completed_at is null then
    raise exception 'The stay check-out must be completed before the stay can be closed';
  end if;

  select count(*) into _open
    from public.hospitality_room_assignments a
   where a.stay_id = _stay_id and a.released_at is null;
  if _open > 0 then
    raise exception 'Release every room assignment before completing the stay';
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays set status = 'completed', completed_at = now() where id = _stay_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'STAY_COMPLETED', null, null, null, null, _note);
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.stay.completed',
    'hospitality_stay', _stay_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_id', _stay_id, 'status', 'completed', 'unchanged', false);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.complete', _key, _out);
  return _out;
end;
$$;

create or replace function public.cancel_hospitality_stay(
  _stay_id uuid, _reason text, _idempotency_key text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _out jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.cancel', _key);
  if _out is not null then return _out; end if;
  if _stay.status = 'cancelled' then
    _out := jsonb_build_object('stay_id', _stay_id, 'status', 'cancelled', 'unchanged', true);
    perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.cancel', _key, _out);
    return _out;
  end if;
  if _stay.status = 'completed' then raise exception 'A completed stay cannot be cancelled'; end if;
  if _why is null then raise exception 'A reason is required to cancel a stay'; end if;
  perform app_private.assert_generic_note(_why);

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays
     set status = 'cancelled', cancelled_at = now(), cancellation_reason = _why
   where id = _stay_id;
  update public.hospitality_room_assignments
     set released_at = now(), released_by = auth.uid(), release_reason = 'Stay cancelled'
   where stay_id = _stay_id and released_at is null;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'STAY_CANCELLED', null, null, null, null, _why);
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.stay.cancelled',
    'hospitality_stay', _stay_id, _key, jsonb_build_object('reason', _why));
  _out := jsonb_build_object('stay_id', _stay_id, 'status', 'cancelled', 'unchanged', false);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.cancel', _key, _out);
  return _out;
end;
$$;

-- =====================================================================
-- COMMANDS · ROOMS
-- =====================================================================
create or replace function public.create_hospitality_room(
  _stay_id uuid, _label text, _capacity integer, _idempotency_key text,
  _floor_label text default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _row public.hospitality_rooms;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.room.create', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_label,'')),'') is null then raise exception 'A room label is required'; end if;
  if coalesce(_capacity, 0) < 1 then raise exception 'Room capacity must be at least 1'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w06_control','on', true);
  insert into public.hospitality_rooms
    (tenant_id, stay_id, label, capacity, floor_label, notes, created_by)
  values (_stay.tenant_id, _stay.id, btrim(_label), _capacity,
          nullif(btrim(coalesce(_floor_label,'')),''), nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.room.created',
    'hospitality_room', _row.id, _key, jsonb_build_object('capacity', _row.capacity));
  _out := jsonb_build_object('room_id', _row.id, 'stay_id', _stay.id);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.room.create', _key, _out);
  return _out;
end;
$$;

create or replace function public.update_hospitality_room(
  _room_id uuid, _idempotency_key text, _label text default null,
  _capacity integer default null, _floor_label text default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _room public.hospitality_rooms; _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb; _occupied integer;
begin
  _room := app_private.w06_room(_room_id);
  _stay := app_private.w06_stay(_room.stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.room.update', _key);
  if _out is not null then return _out; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  if _capacity is not null then
    if _capacity < 1 then raise exception 'Room capacity must be at least 1'; end if;
    _occupied := app_private.w06_room_occupancy(_room_id);
    if _capacity < _occupied then
      raise exception 'This room already holds % guests. Move a guest before reducing capacity.', _occupied;
    end if;
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_rooms set
    label = coalesce(nullif(btrim(coalesce(_label,'')),''), label),
    capacity = coalesce(_capacity, capacity),
    floor_label = coalesce(nullif(btrim(coalesce(_floor_label,'')),''), floor_label),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes)
  where id = _room_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(_room.tenant_id, auth.uid(), 'hospitality.room.updated',
    'hospitality_room', _room_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('room_id', _room_id);
  perform app_private.w06_claim_key(_room.tenant_id, 'hospitality.room.update', _key, _out);
  return _out;
end;
$$;