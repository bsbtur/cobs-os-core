create or replace function public.set_driver_active(_driver_id uuid, _is_active boolean, _reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _row public.drivers;
  _why text := nullif(btrim(coalesce(_reason,'')),'');
  _blocking_count integer;
begin
  select * into _row from public.drivers d where d.id = _driver_id;
  if _row.id is null then raise exception 'Driver not found'; end if;
  perform app_private.w05_assert_role(_row.tenant_id);
  if _is_active is false and _why is null then
    raise exception 'A reason is required to retire a driver';
  end if;
  perform app_private.assert_generic_note(_why);

  if _is_active is false then
    select count(*) into _blocking_count
    from public.transport_legs l
    join public.operations o on o.id = l.operation_id and o.tenant_id = l.tenant_id
    where l.tenant_id = _row.tenant_id
      and l.driver_id = _driver_id
      and o.status not in ('completed','cancelled')
      and not exists (
        select 1 from public.transport_events e
        where e.transport_leg_id = l.id
          and e.tenant_id = l.tenant_id
          and e.event_type in ('DESTINATION_ARRIVED','LEG_CANCELLED')
      );
    if _blocking_count > 0 then
      raise exception 'This driver is assigned to % open transport leg(s). Reassign or close those legs before retiring the driver', _blocking_count;
    end if;
  end if;

  perform set_config('app.w05_control','on', true);
  update public.drivers set is_active = _is_active where id = _driver_id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_row.tenant_id, auth.uid(),
    case when _is_active then 'driver.reactivated' else 'driver.deactivated' end,
    'driver', _driver_id, null, jsonb_build_object('reason', _why));
  return jsonb_build_object('driver_id', _driver_id, 'is_active', _is_active);
end;
$function$;

create or replace function public.set_vehicle_active(_vehicle_id uuid, _is_active boolean, _reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _row public.vehicles;
  _why text := nullif(btrim(coalesce(_reason,'')),'');
  _blocking_count integer;
begin
  select * into _row from public.vehicles v where v.id = _vehicle_id;
  if _row.id is null then raise exception 'Vehicle not found'; end if;
  perform app_private.w05_assert_role(_row.tenant_id);
  if _is_active is false and _why is null then
    raise exception 'A reason is required to retire a vehicle';
  end if;
  perform app_private.assert_generic_note(_why);

  if _is_active is false then
    select count(*) into _blocking_count
    from public.transport_legs l
    join public.operations o on o.id = l.operation_id and o.tenant_id = l.tenant_id
    where l.tenant_id = _row.tenant_id
      and l.vehicle_id = _vehicle_id
      and o.status not in ('completed','cancelled')
      and not exists (
        select 1 from public.transport_events e
        where e.transport_leg_id = l.id
          and e.tenant_id = l.tenant_id
          and e.event_type in ('DESTINATION_ARRIVED','LEG_CANCELLED')
      );
    if _blocking_count > 0 then
      raise exception 'This vehicle is assigned to % open transport leg(s). Reassign or close those legs before retiring the vehicle', _blocking_count;
    end if;
  end if;

  perform set_config('app.w05_control','on', true);
  update public.vehicles set is_active = _is_active where id = _vehicle_id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_row.tenant_id, auth.uid(),
    case when _is_active then 'vehicle.reactivated' else 'vehicle.deactivated' end,
    'vehicle', _vehicle_id, null, jsonb_build_object('reason', _why));
  return jsonb_build_object('vehicle_id', _vehicle_id, 'is_active', _is_active);
end;
$function$;

create or replace function public.record_leg_departed(_transport_leg_id uuid, _occurred_at timestamp with time zone default null::timestamp with time zone, _note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _leg public.transport_legs;
  _id uuid;
  _step public.journey_steps;
  _driver_active boolean;
  _vehicle_active boolean;
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
  select d.is_active into _driver_active from public.drivers d where d.id=_leg.driver_id and d.tenant_id=_leg.tenant_id;
  select v.is_active into _vehicle_active from public.vehicles v where v.id=_leg.vehicle_id and v.tenant_id=_leg.tenant_id;
  if coalesce(_driver_active,false) is not true then
    raise exception 'The assigned driver is inactive. Assign an active driver before departure';
  end if;
  if coalesce(_vehicle_active,false) is not true then
    raise exception 'The assigned vehicle is inactive. Assign an active vehicle before departure';
  end if;
  if not app_private.w05_has_event(_leg.id, 'VEHICLE_AT_PICKUP') then
    raise exception 'Record the vehicle at the pickup point before departure';
  end if;
  if _leg.journey_step_id is not null then
    select * into _step from public.journey_steps s
      where s.id = _leg.journey_step_id and s.tenant_id = _leg.tenant_id;
    if _step.id is not null
       and app_private.w05_step_requires_authorization(_step.step_kind)
       and not app_private.w04_has_event(_step.id, 'DEPARTURE_AUTHORIZED') then
      raise exception 'Departure has not been authorized on the linked journey step yet. Authorize it in the Journey first.';
    end if;
  end if;
  _id := app_private.record_transport_event(_leg, 'LEG_DEPARTED', _occurred_at, _note,
    jsonb_build_object('vehicle_id', _leg.vehicle_id, 'driver_id', _leg.driver_id));
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.leg_departed',
    'transport_leg', _leg.id, null,
    jsonb_build_object('vehicle_id', _leg.vehicle_id, 'driver_id', _leg.driver_id));
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$function$;