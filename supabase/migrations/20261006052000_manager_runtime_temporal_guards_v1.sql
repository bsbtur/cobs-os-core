-- Manager/runtime safety guards validated during Team Seffrin QA.
-- 1) Hospitality check-in cannot open before the effective scheduled check-in.
-- 2) Transport departure/arrival facts can only be recorded while the operation is active.

create or replace function public.open_stay_checkin(
  _stay_id uuid,
  _idempotency_key text,
  _occurred_at timestamptz default null,
  _note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _stay public.hospitality_stays;
  _key text:=nullif(btrim(coalesce(_idempotency_key,'')),'');
  _out jsonb;
  _at timestamptz:=coalesce(_occurred_at,now());
  _earliest timestamptz;
begin
  _stay:=app_private.w06_stay(_stay_id);
  perform app_private.assert_operation_not_closed(_stay.operation_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out:=app_private.w06_replay('hospitality.stay.open_checkin',_key);
  if _out is not null then return _out; end if;

  if _stay.status='active' then
    _out:=jsonb_build_object('stay_id',_stay_id,'status','active','unchanged',true);
    perform app_private.w06_claim_key(_stay.tenant_id,'hospitality.stay.open_checkin',_key,_out);
    return _out;
  end if;

  if _stay.status <> 'confirmed' then
    raise exception 'Check-in can only be opened for a confirmed stay';
  end if;

  _earliest:=coalesce(_stay.expected_check_in,_stay.planned_check_in);
  if _earliest is not null and _at < _earliest then
    raise exception 'Check-in cannot be opened before the scheduled check-in time';
  end if;

  perform set_config('app.w06_control','on',true);
  update public.hospitality_stays
  set status='active', checkin_opened_at=_at
  where id=_stay_id;
  perform set_config('app.w06_control','off',true);

  perform app_private.record_hospitality_event(_stay,'STAY_CHECKIN_OPENED',null,null,null,_at,_note);
  perform app_private.record_audit_event(
    _stay.tenant_id,auth.uid(),'hospitality.stay.checkin_opened',
    'hospitality_stay',_stay_id,_key,'{}'::jsonb
  );

  _out:=jsonb_build_object('stay_id',_stay_id,'status','active','unchanged',false);
  perform app_private.w06_claim_key(_stay.tenant_id,'hospitality.stay.open_checkin',_key,_out);
  return _out;
end;
$function$;

create or replace function public.record_leg_departed(
  _transport_leg_id uuid,
  _occurred_at timestamptz default null,
  _note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _leg public.transport_legs;
  _id uuid;
  _step public.journey_steps;
  _previous_step public.journey_steps;
  _authorized boolean := false;
  _operation_status public.operation_status;
begin
  _leg := app_private.w05_leg(_transport_leg_id);

  select status into _operation_status
  from public.operations
  where id=_leg.operation_id and tenant_id=_leg.tenant_id;

  if _operation_status <> 'active' then
    raise exception 'A transport leg can only depart while the operation is active';
  end if;

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

  if _leg.journey_step_id is not null then
    select * into _step
    from public.journey_steps s
    where s.id = _leg.journey_step_id and s.tenant_id = _leg.tenant_id;

    if _step.id is not null and app_private.w05_step_requires_authorization(_step.step_kind) then
      _authorized := app_private.w04_has_event(_step.id, 'DEPARTURE_AUTHORIZED');

      if not _authorized and _step.step_kind = 'movement' then
        select s.* into _previous_step
        from public.journey_steps s
        where s.operation_id = _step.operation_id
          and s.tenant_id = _step.tenant_id
          and s.sequence < _step.sequence
        order by s.sequence desc
        limit 1;

        if _previous_step.id is not null and _previous_step.step_kind in ('boarding','return') then
          _authorized := app_private.w04_has_event(_previous_step.id, 'DEPARTURE_AUTHORIZED');
        end if;
      end if;

      if not _authorized then
        raise exception 'Departure has not been authorized on the linked journey step yet. Authorize it in the Journey first.';
      end if;
    end if;
  end if;

  _id := app_private.record_transport_event(
    _leg,'LEG_DEPARTED',_occurred_at,_note,
    jsonb_build_object('vehicle_id',_leg.vehicle_id,'driver_id',_leg.driver_id)
  );
  perform app_private.record_audit_event(
    _leg.tenant_id,auth.uid(),'transport.leg_departed','transport_leg',_leg.id,null,
    jsonb_build_object('vehicle_id',_leg.vehicle_id,'driver_id',_leg.driver_id)
  );
  return jsonb_build_object('transport_leg_id',_leg.id,'transport_event_id',_id);
end;
$function$;

create or replace function public.record_destination_arrived(
  _transport_leg_id uuid,
  _occurred_at timestamptz default null,
  _note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _leg public.transport_legs;
  _id uuid;
  _operation_status public.operation_status;
begin
  _leg := app_private.w05_leg(_transport_leg_id);

  select status into _operation_status
  from public.operations
  where id=_leg.operation_id and tenant_id=_leg.tenant_id;

  if _operation_status <> 'active' then
    raise exception 'A transport leg can only arrive while the operation is active';
  end if;

  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if not app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    raise exception 'The vehicle has not departed yet';
  end if;
  if app_private.w05_has_event(_leg.id, 'DESTINATION_ARRIVED') then
    return jsonb_build_object('transport_leg_id', _leg.id, 'unchanged', true);
  end if;

  _id := app_private.record_transport_event(_leg,'DESTINATION_ARRIVED',_occurred_at,_note);
  perform app_private.record_audit_event(
    _leg.tenant_id,auth.uid(),'transport.destination_arrived',
    'transport_leg',_leg.id,null,'{}'::jsonb
  );
  return jsonb_build_object('transport_leg_id',_leg.id,'transport_event_id',_id);
end;
$function$;