-- ============================================================
-- W05 PRE-VERIFICATION HOTFIX (additive, mobility-scoped)
-- ============================================================

-- ---------- HOTFIX 1: lock every W05 private helper ----------
do $$
declare _p record;
begin
  for _p in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and (p.proname like 'w05\_%' or p.proname = 'record_transport_event')
  loop
    execute format('revoke all on function %s from public', _p.sig);
    execute format('revoke all on function %s from anon', _p.sig);
    execute format('revoke all on function %s from authenticated', _p.sig);
    execute format('grant execute on function %s to service_role', _p.sig);
  end loop;
end $$;

-- ---------- HOTFIX 2: narrow W05 table ACLs ----------
do $$
declare _t text;
begin
  foreach _t in array array['vehicles','drivers','transport_legs','transport_leg_stops',
                            'transport_events','transport_seat_assignments']
  loop
    execute format('revoke all on table public.%I from public', _t);
    execute format('revoke all on table public.%I from anon', _t);
    execute format('revoke all on table public.%I from authenticated', _t);
    execute format('grant select on table public.%I to authenticated', _t);
    execute format('grant all on table public.%I to service_role', _t);
  end loop;
end $$;

-- ---------- HOTFIX 4: typed transport event subjects ----------
alter table public.transport_events
  add column if not exists subject_driver_id uuid,
  add column if not exists subject_vehicle_id uuid;

alter table public.transport_events
  add constraint transport_events_subject_driver_fk
  foreign key (subject_driver_id, tenant_id) references public.drivers(id, tenant_id);

alter table public.transport_events
  add constraint transport_events_subject_vehicle_fk
  foreign key (subject_vehicle_id, tenant_id) references public.vehicles(id, tenant_id);

create index if not exists transport_events_subject_driver_idx
  on public.transport_events (subject_driver_id, occurred_at desc)
  where subject_driver_id is not null;

create index if not exists transport_events_subject_vehicle_idx
  on public.transport_events (subject_vehicle_id, occurred_at desc)
  where subject_vehicle_id is not null;

comment on column public.transport_events.subject_driver_id is
  'Canonical typed subject: the driver this transport fact concerns. Never an actor.';
comment on column public.transport_events.subject_vehicle_id is
  'Canonical typed subject: the vehicle this transport fact concerns.';

-- shared event insertion path: populate typed subjects for dispatch facts
create or replace function app_private.record_transport_event(
  _leg public.transport_legs,
  _type public.transport_event_type,
  _occurred_at timestamptz default null,
  _note text default null,
  _context jsonb default '{}'::jsonb,
  _stop_id uuid default null,
  _subject_driver_id uuid default null,
  _subject_vehicle_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _id uuid; _at timestamptz := coalesce(_occurred_at, now());
  _driver uuid; _vehicle uuid;
begin
  if _at > now() + interval '5 minutes' then
    raise exception 'A transport fact cannot be recorded in the future';
  end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));

  -- TYPED SUBJECTS: dispatch/movement facts concern the leg's current vehicle and driver.
  if _type in ('VEHICLE_REQUESTED','VEHICLE_EN_ROUTE_TO_PICKUP','VEHICLE_AT_PICKUP',
               'LEG_DEPARTED','STOP_REACHED','DESTINATION_ARRIVED','LEG_CANCELLED',
               'TRANSPORT_INCIDENT_NOTED') then
    _driver := coalesce(_subject_driver_id, _leg.driver_id);
    _vehicle := coalesce(_subject_vehicle_id, _leg.vehicle_id);
  else
    _driver := _subject_driver_id;
    _vehicle := _subject_vehicle_id;
  end if;

  perform set_config('app.w05_control','on', true);
  insert into public.transport_events
    (tenant_id, operation_id, transport_leg_id, transport_leg_stop_id, event_type,
     actor_profile_id, occurred_at, note, context, correlation_id,
     subject_driver_id, subject_vehicle_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, _stop_id, _type, auth.uid(), _at,
          nullif(btrim(coalesce(_note,'')),''), coalesce(_context,'{}'::jsonb),
          gen_random_uuid()::text, _driver, _vehicle)
  on conflict do nothing
  returning id into _id;
  perform set_config('app.w05_control','off', true);

  if _id is null then
    select e.id into _id from public.transport_events e
      where e.transport_leg_id = _leg.id and e.event_type = _type
        and e.transport_leg_stop_id is not distinct from _stop_id
      limit 1;
  end if;
  return _id;
end;
$function$;

revoke all on function app_private.record_transport_event(
  public.transport_legs, public.transport_event_type, timestamptz, text, jsonb, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function app_private.record_transport_event(
  public.transport_legs, public.transport_event_type, timestamptz, text, jsonb, uuid, uuid, uuid)
  to service_role;

drop function if exists app_private.record_transport_event(
  public.transport_legs, public.transport_event_type, timestamptz, text, jsonb, uuid);

-- direct-insert commands: vehicle assignment
create or replace function public.assign_vehicle_to_leg(
  _transport_leg_id uuid, _vehicle_id uuid, _reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _leg public.transport_legs; _vehicle public.vehicles;
  _why text := nullif(btrim(coalesce(_reason,'')),''); _id uuid; _changed boolean;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  select * into _vehicle from public.vehicles v where v.id = _vehicle_id and v.tenant_id = _leg.tenant_id;
  if _vehicle.id is null then raise exception 'Vehicle not found in this organization'; end if;
  if not _vehicle.is_active then raise exception 'That vehicle is retired'; end if;
  if _leg.vehicle_id = _vehicle_id then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;
  _changed := _leg.vehicle_id is not null;
  if _changed and _why is null then
    raise exception 'A reason is required to replace the assigned vehicle';
  end if;
  perform app_private.assert_generic_note(_why);

  perform set_config('app.w05_control','on', true);
  update public.transport_legs set vehicle_id = _vehicle_id where id = _leg.id;
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id,
    subject_vehicle_id, subject_driver_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id,
    case when _changed then 'ASSIGNMENT_CHANGED' else 'VEHICLE_ASSIGNED' end,
    auth.uid(), now(), _why,
    case when _changed
      then jsonb_build_object('field','vehicle','previous_vehicle_id',_leg.vehicle_id,'new_vehicle_id',_vehicle_id)
      else jsonb_build_object('vehicle_id', _vehicle_id) end,
    gen_random_uuid()::text, _vehicle_id, _leg.driver_id)
  returning id into _id;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(),
    case when _changed then 'transport.vehicle_changed' else 'transport.vehicle_assigned' end,
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_vehicle_id', _leg.vehicle_id, 'vehicle_id', _vehicle_id, 'reason', _why));
  return jsonb_build_object('transport_leg_id', _leg.id, 'vehicle_id', _vehicle_id, 'transport_event_id', _id);
end;
$function$;

-- direct-insert commands: driver assignment
create or replace function public.assign_driver_to_leg(
  _transport_leg_id uuid, _driver_id uuid, _reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _leg public.transport_legs; _driver public.drivers;
  _why text := nullif(btrim(coalesce(_reason,'')),''); _id uuid; _changed boolean;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  select * into _driver from public.drivers d where d.id = _driver_id and d.tenant_id = _leg.tenant_id;
  if _driver.id is null then raise exception 'Driver not found in this organization'; end if;
  if not _driver.is_active then raise exception 'That driver is retired'; end if;
  if _leg.driver_id = _driver_id then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;
  _changed := _leg.driver_id is not null;
  if _changed and _why is null then
    raise exception 'A reason is required to replace the assigned driver';
  end if;
  perform app_private.assert_generic_note(_why);

  perform set_config('app.w05_control','on', true);
  update public.transport_legs set driver_id = _driver_id where id = _leg.id;
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id,
    subject_driver_id, subject_vehicle_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id,
    case when _changed then 'ASSIGNMENT_CHANGED' else 'DRIVER_ASSIGNED' end,
    auth.uid(), now(), _why,
    jsonb_build_object('field','driver','previous_driver_id',_leg.driver_id,'new_driver_id',_driver_id),
    gen_random_uuid()::text, _driver_id, _leg.vehicle_id)
  returning id into _id;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(),
    case when _changed then 'transport.driver_changed' else 'transport.driver_assigned' end,
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_driver_id', _leg.driver_id, 'driver_id', _driver_id, 'reason', _why));
  return jsonb_build_object('transport_leg_id', _leg.id, 'driver_id', _driver_id, 'transport_event_id', _id);
end;
$function$;

-- direct-insert commands: clearing an assignment
create or replace function public.clear_leg_assignment(_transport_leg_id uuid, _reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _leg public.transport_legs; _why text := nullif(btrim(coalesce(_reason,'')),''); _id uuid;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);
  if _why is null then raise exception 'A reason is required to clear the assignment'; end if;
  perform app_private.assert_generic_note(_why);
  if _leg.vehicle_id is null and _leg.driver_id is null then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;

  perform set_config('app.w05_control','on', true);
  update public.transport_legs set vehicle_id = null, driver_id = null where id = _leg.id;
  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id,
    subject_driver_id, subject_vehicle_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, 'ASSIGNMENT_CLEARED', auth.uid(), now(), _why,
    jsonb_build_object('previous_vehicle_id', _leg.vehicle_id, 'previous_driver_id', _leg.driver_id),
    gen_random_uuid()::text, _leg.driver_id, _leg.vehicle_id)
  returning id into _id;
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.assignment_cleared',
    'transport_leg', _leg.id, null,
    jsonb_build_object('previous_vehicle_id', _leg.vehicle_id, 'previous_driver_id', _leg.driver_id,
                       'reason', _why));
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$function$;

-- ---------- HOTFIX 3: LEG_DEPARTED observes W04 authorization ----------
-- Linked journey steps whose kind is a departure context require W04 DEPARTURE_AUTHORIZED.
create or replace function app_private.w05_step_requires_authorization(_kind public.journey_step_kind)
returns boolean
language sql
immutable
set search_path to 'pg_catalog','public'
as $function$
  select _kind in ('boarding','movement','return')
$function$;

revoke all on function app_private.w05_step_requires_authorization(public.journey_step_kind)
  from public, anon, authenticated;
grant execute on function app_private.w05_step_requires_authorization(public.journey_step_kind)
  to service_role;

create or replace function public.record_leg_departed(
  _transport_leg_id uuid,
  _occurred_at timestamptz default null,
  _note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _leg public.transport_legs; _id uuid; _step public.journey_steps;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;
  if _leg.vehicle_id is null or _leg.driver_id is null then
    raise exception 'A transport leg needs both a vehicle and a driver before it departs';
  end if;
  if not app_private.w05_has_event(_leg.id, 'VEHICLE_AT_PICKUP') then
    raise exception 'Record the vehicle at the pickup point before departure';
  end if;

  -- MOBILITY READS JOURNEY, NEVER WRITES IT.
  if _leg.journey_step_id is not null then
    select * into _step from public.journey_steps s
      where s.id = _leg.journey_step_id and s.tenant_id = _leg.tenant_id;
    if _step.id is not null
       and app_private.w05_step_requires_authorization(_step.step_kind)
       and not app_private.w04_has_event(_step.id, 'DEPARTURE_AUTHORIZED') then
      raise exception 'Departure has not been authorized on the linked journey step yet. Authorize it in the Journey first.';
    end if;
  end if;

  -- DEPARTURE_AUTHORIZED != LEG_DEPARTED: this is a vehicle fact only.
  _id := app_private.record_transport_event(_leg, 'LEG_DEPARTED', _occurred_at, _note,
    jsonb_build_object('vehicle_id', _leg.vehicle_id, 'driver_id', _leg.driver_id));
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.leg_departed',
    'transport_leg', _leg.id, null,
    jsonb_build_object('vehicle_id', _leg.vehicle_id, 'driver_id', _leg.driver_id));
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$function$;

-- ---------- re-assert command EXECUTE grants ----------
do $$
declare _p record;
begin
  for _p in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('assign_vehicle_to_leg','assign_driver_to_leg','clear_leg_assignment',
                        'record_leg_departed')
  loop
    execute format('revoke all on function %s from public, anon', _p.sig);
    execute format('grant execute on function %s to authenticated, service_role', _p.sig);
  end loop;
end $$;