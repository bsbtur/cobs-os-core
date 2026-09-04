CREATE OR REPLACE FUNCTION public.assign_vehicle_to_leg(_transport_leg_id uuid, _vehicle_id uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    (case when _changed then 'ASSIGNMENT_CHANGED' else 'VEHICLE_ASSIGNED' end)::public.transport_event_type,
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

CREATE OR REPLACE FUNCTION public.assign_driver_to_leg(_transport_leg_id uuid, _driver_id uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    (case when _changed then 'ASSIGNMENT_CHANGED' else 'DRIVER_ASSIGNED' end)::public.transport_event_type,
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

REVOKE ALL ON FUNCTION public.assign_vehicle_to_leg(uuid, uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.assign_driver_to_leg(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_vehicle_to_leg(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_driver_to_leg(uuid, uuid, text) TO authenticated, service_role;