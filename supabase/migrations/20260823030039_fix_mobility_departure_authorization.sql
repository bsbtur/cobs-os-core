create or replace function public.record_leg_departed(
  _transport_leg_id uuid,
  _occurred_at timestamptz default null,
  _note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _leg public.transport_legs;
  _id uuid;
  _step public.journey_steps;
  _previous_step public.journey_steps;
  _authorized boolean := false;
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
  -- A transport leg is commonly linked to the movement step, while the explicit
  -- departure authorization is canonically recorded on the immediately preceding
  -- boarding/return step. Accept either the linked step's own authorization or,
  -- for movement legs, the authorization on that immediately preceding gate.
  if _leg.journey_step_id is not null then
    select * into _step
    from public.journey_steps s
    where s.id = _leg.journey_step_id
      and s.tenant_id = _leg.tenant_id;

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

        if _previous_step.id is not null
           and _previous_step.step_kind in ('boarding', 'return') then
          _authorized := app_private.w04_has_event(_previous_step.id, 'DEPARTURE_AUTHORIZED');
        end if;
      end if;

      if not _authorized then
        raise exception 'Departure has not been authorized on the linked journey step yet. Authorize it in the Journey first.';
      end if;
    end if;
  end if;

  -- DEPARTURE_AUTHORIZED != LEG_DEPARTED: this is a vehicle fact only.
  _id := app_private.record_transport_event(
    _leg,
    'LEG_DEPARTED',
    _occurred_at,
    _note,
    jsonb_build_object('vehicle_id', _leg.vehicle_id, 'driver_id', _leg.driver_id)
  );
  perform app_private.record_audit_event(
    _leg.tenant_id,
    auth.uid(),
    'transport.leg_departed',
    'transport_leg',
    _leg.id,
    null,
    jsonb_build_object('vehicle_id', _leg.vehicle_id, 'driver_id', _leg.driver_id)
  );
  return jsonb_build_object('transport_leg_id', _leg.id, 'transport_event_id', _id);
end;
$function$;