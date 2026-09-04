-- =====================================================================
-- PRIVATE HELPERS
-- =====================================================================
create or replace function app_private.w06_assert_role(_tenant_id uuid)
returns void language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id,
       array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission for hospitality in this organization';
  end if;
end;
$$;

create or replace function app_private.w06_assert_override_role(_tenant_id uuid)
returns void language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
begin
  if not app_private.has_tenant_role(_tenant_id,
       array['owner','admin']::public.app_role[]) then
    raise exception 'Only an owner or admin can exceed room capacity';
  end if;
end;
$$;

create or replace function app_private.w06_property(_property_id uuid)
returns public.hospitality_properties language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.hospitality_properties;
begin
  select * into _row from public.hospitality_properties p where p.id = _property_id;
  if _row.id is null then raise exception 'Property not found'; end if;
  perform app_private.w06_assert_role(_row.tenant_id);
  return _row;
end;
$$;

create or replace function app_private.w06_stay(_stay_id uuid)
returns public.hospitality_stays language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.hospitality_stays;
begin
  select * into _row from public.hospitality_stays s where s.id = _stay_id;
  if _row.id is null then raise exception 'Stay not found'; end if;
  perform app_private.w06_assert_role(_row.tenant_id);
  return _row;
end;
$$;

create or replace function app_private.w06_room(_room_id uuid)
returns public.hospitality_rooms language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.hospitality_rooms;
begin
  select * into _row from public.hospitality_rooms r where r.id = _room_id;
  if _row.id is null then raise exception 'Room not found'; end if;
  perform app_private.w06_assert_role(_row.tenant_id);
  return _row;
end;
$$;

create or replace function app_private.w06_stay_participation(_stay_participation_id uuid)
returns public.hospitality_stay_participations language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.hospitality_stay_participations;
begin
  select * into _row from public.hospitality_stay_participations g
   where g.id = _stay_participation_id;
  if _row.id is null then raise exception 'Guest is not part of this stay'; end if;
  perform app_private.w06_assert_role(_row.tenant_id);
  return _row;
end;
$$;

create or replace function app_private.w06_assert_open(_stay public.hospitality_stays)
returns void language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
begin
  if _stay.status in ('completed','cancelled') then
    raise exception 'This stay is closed and can no longer be changed';
  end if;
end;
$$;

-- Current occupancy = open assignments for the room (no pseudo time windows).
create or replace function app_private.w06_room_occupancy(_room_id uuid)
returns integer language sql stable security definer
set search_path = 'pg_catalog','public' as $$
  select count(*)::integer from public.hospitality_room_assignments a
   where a.room_id = _room_id and a.released_at is null
$$;

-- Guest hospitality state derived exclusively from hospitality_events.
create or replace function app_private.w06_guest_state(_stay_participation_id uuid)
returns text language sql stable security definer
set search_path = 'pg_catalog','public' as $$
  select coalesce((
    select case e.event_type
             when 'GUEST_CHECKED_IN' then 'CHECKED_IN'
             when 'GUEST_CHECKED_OUT' then 'CHECKED_OUT'
             when 'GUEST_NO_SHOW_RECORDED' then 'NO_SHOW'
           end
      from public.hospitality_events e
     where e.stay_participation_id = _stay_participation_id
       and e.event_type in ('GUEST_CHECKED_IN','GUEST_CHECKED_OUT','GUEST_NO_SHOW_RECORDED')
     order by e.occurred_at desc, e.recorded_at desc
     limit 1), 'NOT_ARRIVED')
$$;

-- PRIVATE: the only writer of hospitality_events.
create or replace function app_private.record_hospitality_event(
  _stay public.hospitality_stays, _type public.hospitality_event_type,
  _room_id uuid default null, _stay_participation_id uuid default null,
  _room_assignment_id uuid default null, _occurred_at timestamptz default null,
  _note text default null, _context jsonb default '{}'::jsonb,
  _correlation_id text default null)
returns uuid language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _id uuid; _at timestamptz := coalesce(_occurred_at, now());
begin
  if _at > now() + interval '5 minutes' then
    raise exception 'A hospitality fact cannot be recorded in the future';
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));

  perform set_config('app.w06_control','on', true);
  insert into public.hospitality_events
    (tenant_id, operation_id, stay_id, room_id, stay_participation_id, room_assignment_id,
     event_type, actor_profile_id, occurred_at, note, context, correlation_id)
  values (_stay.tenant_id, _stay.operation_id, _stay.id, _room_id, _stay_participation_id,
          _room_assignment_id, _type, auth.uid(), _at,
          nullif(btrim(coalesce(_note,'')),''), coalesce(_context,'{}'::jsonb),
          coalesce(nullif(btrim(coalesce(_correlation_id,'')),''), gen_random_uuid()::text))
  returning id into _id;
  perform set_config('app.w06_control','off', true);
  return _id;
end;
$$;

create or replace function app_private.w06_claim_key(
  _tenant_id uuid, _action text, _key text, _result jsonb)
returns void language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
begin
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_tenant_id, auth.uid(), _action, _key, _result);
end;
$$;

create or replace function app_private.w06_replay(_action text, _key text)
returns jsonb language sql stable security definer
set search_path = 'pg_catalog','public' as $$
  select k.result from public.idempotency_keys k
   where k.actor_profile_id = auth.uid() and k.action = _action and k.idempotency_key = _key
$$;

-- Private helpers are never reachable from the API roles.
revoke all on function
  app_private.w06_control_active(),
  app_private.w06_assert_role(uuid),
  app_private.w06_assert_override_role(uuid),
  app_private.w06_property(uuid),
  app_private.w06_stay(uuid),
  app_private.w06_room(uuid),
  app_private.w06_stay_participation(uuid),
  app_private.w06_assert_open(public.hospitality_stays),
  app_private.w06_room_occupancy(uuid),
  app_private.w06_guest_state(uuid),
  app_private.record_hospitality_event(public.hospitality_stays, public.hospitality_event_type,
    uuid, uuid, uuid, timestamptz, text, jsonb, text),
  app_private.w06_claim_key(uuid, text, text, jsonb),
  app_private.w06_replay(text, text)
from public, anon, authenticated;

-- =====================================================================
-- COMMANDS · PROPERTIES
-- =====================================================================
create or replace function public.create_hospitality_property(
  _tenant_id uuid, _name text, _idempotency_key text,
  _property_kind public.hospitality_property_kind default 'hotel',
  _country_code text default null, _region text default null, _city text default null,
  _address_label text default null, _timezone text default null,
  _contact_label text default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.hospitality_properties; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  perform app_private.w06_assert_role(_tenant_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.property.create', _key);
  if _out is not null then return _out; end if;
  if nullif(btrim(coalesce(_name,'')),'') is null then raise exception 'A property name is required'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w06_control','on', true);
  insert into public.hospitality_properties
    (tenant_id, name, property_kind, country_code, region, city, address_label,
     timezone, contact_label, notes, created_by)
  values (_tenant_id, btrim(_name), _property_kind,
          upper(nullif(btrim(coalesce(_country_code,'')),'')),
          nullif(btrim(coalesce(_region,'')),''), nullif(btrim(coalesce(_city,'')),''),
          nullif(btrim(coalesce(_address_label,'')),''), nullif(btrim(coalesce(_timezone,'')),''),
          nullif(btrim(coalesce(_contact_label,'')),''), nullif(btrim(coalesce(_notes,'')),''),
          auth.uid())
  returning * into _row;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'hospitality.property.created',
    'hospitality_property', _row.id, _key, jsonb_build_object('kind', _row.property_kind));
  _out := jsonb_build_object('property_id', _row.id, 'tenant_id', _tenant_id);
  perform app_private.w06_claim_key(_tenant_id, 'hospitality.property.create', _key, _out);
  return _out;
end;
$$;

create or replace function public.update_hospitality_property(
  _property_id uuid, _idempotency_key text,
  _name text default null, _property_kind public.hospitality_property_kind default null,
  _country_code text default null, _region text default null, _city text default null,
  _address_label text default null, _timezone text default null,
  _contact_label text default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.hospitality_properties; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _row := app_private.w06_property(_property_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.property.update', _key);
  if _out is not null then return _out; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w06_control','on', true);
  update public.hospitality_properties set
    name = coalesce(nullif(btrim(coalesce(_name,'')),''), name),
    property_kind = coalesce(_property_kind, property_kind),
    country_code = coalesce(upper(nullif(btrim(coalesce(_country_code,'')),'')), country_code),
    region = coalesce(nullif(btrim(coalesce(_region,'')),''), region),
    city = coalesce(nullif(btrim(coalesce(_city,'')),''), city),
    address_label = coalesce(nullif(btrim(coalesce(_address_label,'')),''), address_label),
    timezone = coalesce(nullif(btrim(coalesce(_timezone,'')),''), timezone),
    contact_label = coalesce(nullif(btrim(coalesce(_contact_label,'')),''), contact_label),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes)
  where id = _property_id returning * into _row;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(), 'hospitality.property.updated',
    'hospitality_property', _row.id, _key, '{}'::jsonb);
  _out := jsonb_build_object('property_id', _row.id);
  perform app_private.w06_claim_key(_row.tenant_id, 'hospitality.property.update', _key, _out);
  return _out;
end;
$$;

create or replace function public.set_hospitality_property_active(
  _property_id uuid, _is_active boolean, _idempotency_key text, _reason text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.hospitality_properties; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _out jsonb;
begin
  _row := app_private.w06_property(_property_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.property.active', _key);
  if _out is not null then return _out; end if;
  if _is_active is false and _why is null then
    raise exception 'A reason is required to retire a property';
  end if;
  perform app_private.assert_generic_note(_why);
  if _row.is_active = _is_active then
    _out := jsonb_build_object('property_id', _property_id, 'is_active', _is_active, 'unchanged', true);
    perform app_private.w06_claim_key(_row.tenant_id, 'hospitality.property.active', _key, _out);
    return _out;
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_properties set is_active = _is_active where id = _property_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(_row.tenant_id, auth.uid(),
    case when _is_active then 'hospitality.property.reactivated' else 'hospitality.property.retired' end,
    'hospitality_property', _property_id, _key, jsonb_build_object('reason', _why));
  _out := jsonb_build_object('property_id', _property_id, 'is_active', _is_active, 'unchanged', false);
  perform app_private.w06_claim_key(_row.tenant_id, 'hospitality.property.active', _key, _out);
  return _out;
end;
$$;

-- =====================================================================
-- COMMANDS · STAYS (create / update)
-- =====================================================================
create or replace function public.create_hospitality_stay(
  _operation_id uuid, _property_id uuid, _name text,
  _planned_check_in timestamptz, _planned_check_out timestamptz, _idempotency_key text,
  _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _op public.operations; _prop public.hospitality_properties; _row public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  perform app_private.w06_assert_role(_op.tenant_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.create', _key);
  if _out is not null then return _out; end if;

  select * into _prop from public.hospitality_properties p
   where p.id = _property_id and p.tenant_id = _op.tenant_id;
  if _prop.id is null then raise exception 'Property not found in this organization'; end if;
  if not _prop.is_active then raise exception 'This property is retired'; end if;
  if _planned_check_out <= _planned_check_in then
    raise exception 'Check-out must be after check-in';
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w06_control','on', true);
  insert into public.hospitality_stays
    (tenant_id, operation_id, property_id, name, planned_check_in, planned_check_out,
     notes, created_by)
  values (_op.tenant_id, _op.id, _prop.id,
          coalesce(nullif(btrim(coalesce(_name,'')),''), _prop.name),
          _planned_check_in, _planned_check_out,
          nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'hospitality.stay.created',
    'hospitality_stay', _row.id, _key, jsonb_build_object('property_id', _prop.id));
  _out := jsonb_build_object('stay_id', _row.id, 'operation_id', _op.id, 'tenant_id', _op.tenant_id);
  perform app_private.w06_claim_key(_op.tenant_id, 'hospitality.stay.create', _key, _out);
  return _out;
end;
$$;

create or replace function public.update_hospitality_stay(
  _stay_id uuid, _idempotency_key text, _name text default null, _notes text default null)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  perform app_private.w06_assert_open(_stay);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.update', _key);
  if _out is not null then return _out; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays set
    name = coalesce(nullif(btrim(coalesce(_name,'')),''), name),
    notes = coalesce(nullif(btrim(coalesce(_notes,'')),''), notes)
  where id = _stay_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.stay.updated',
    'hospitality_stay', _stay_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_id', _stay_id);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.update', _key, _out);
  return _out;
end;
$$;