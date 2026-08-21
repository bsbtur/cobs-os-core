-- W05 · QA-MOB-DRIVER-ELIGIBILITY
-- Driver eligibility is decided by the OPERATION (crew/support participation with the
-- canonical 'driver' responsibility), never by global existence in public.drivers.
-- The drivers row is a mere resource, materialized idempotently at assignment time.

CREATE OR REPLACE FUNCTION public.w05_operation_driver_candidates(_operation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _op public.operations; _rows jsonb;
begin
  _op := app_private.w05_operation(_operation_id);

  select coalesce(jsonb_agg(x order by x->>'full_name'), '[]'::jsonb) into _rows
  from (
    select jsonb_build_object(
      'person_id', pe.id,
      'participation_id', pa.id,
      'full_name', pe.full_name,
      'participation_kind', pa.participation_kind,
      'participation_status', pa.status,
      'driver_id', d.id,
      'driver_active', coalesce(d.is_active, false)
    ) as x
    from public.operation_participations pa
    join public.people pe on pe.id = pa.person_id and pe.tenant_id = pa.tenant_id
    join public.operation_role_assignments ra
      on ra.participation_id = pa.id and ra.tenant_id = pa.tenant_id
    join public.operation_role_types rt
      on rt.id = ra.role_type_id and rt.tenant_id = ra.tenant_id
    left join public.drivers d on d.person_id = pe.id and d.tenant_id = pa.tenant_id
    where pa.operation_id = _op.id
      and pa.tenant_id = _op.tenant_id
      and pa.status <> 'cancelled'
      and rt.key = 'driver'
    group by pe.id, pa.id, pe.full_name, pa.participation_kind, pa.status, d.id, d.is_active
  ) s;

  return jsonb_build_object('operation_id', _op.id, 'candidates', _rows);
end;
$function$;

REVOKE ALL ON FUNCTION public.w05_operation_driver_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.w05_operation_driver_candidates(uuid) TO authenticated;

-- Assign an operation-eligible person as driver of a leg, materializing the
-- drivers resource idempotently when it does not exist yet.
CREATE OR REPLACE FUNCTION public.assign_operation_driver_to_leg(
  _transport_leg_id uuid,
  _person_id uuid,
  _reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _leg public.transport_legs; _eligible boolean; _driver public.drivers;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);

  select true into _eligible
  from public.operation_participations pa
  join public.operation_role_assignments ra
    on ra.participation_id = pa.id and ra.tenant_id = pa.tenant_id
  join public.operation_role_types rt
    on rt.id = ra.role_type_id and rt.tenant_id = ra.tenant_id
  where pa.operation_id = _leg.operation_id
    and pa.tenant_id = _leg.tenant_id
    and pa.person_id = _person_id
    and pa.status <> 'cancelled'
    and rt.key = 'driver'
  limit 1;

  if not coalesce(_eligible, false) then
    raise exception 'That person is not assigned as a driver in this operation';
  end if;

  select * into _driver from public.drivers d
   where d.tenant_id = _leg.tenant_id and d.person_id = _person_id;

  if _driver.id is null then
    perform set_config('app.w05_control','on', true);
    insert into public.drivers (tenant_id, person_id, created_by)
    values (_leg.tenant_id, _person_id, auth.uid())
    on conflict (tenant_id, person_id) do nothing;
    perform set_config('app.w05_control','off', true);

    select * into _driver from public.drivers d
     where d.tenant_id = _leg.tenant_id and d.person_id = _person_id;

    if _driver.id is not null then
      perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'driver.materialized',
        'driver', _driver.id, null,
        jsonb_build_object('person_id', _person_id, 'operation_id', _leg.operation_id));
    end if;
  elsif not _driver.is_active then
    perform set_config('app.w05_control','on', true);
    update public.drivers set is_active = true where id = _driver.id;
    perform set_config('app.w05_control','off', true);
    perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'driver.reactivated',
      'driver', _driver.id, null,
      jsonb_build_object('person_id', _person_id, 'operation_id', _leg.operation_id));
    select * into _driver from public.drivers d where d.id = _driver.id;
  end if;

  if _driver.id is null then
    raise exception 'Could not prepare the driver resource for this person';
  end if;

  return public.assign_driver_to_leg(_transport_leg_id, _driver.id, _reason);
end;
$function$;

REVOKE ALL ON FUNCTION public.assign_operation_driver_to_leg(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_operation_driver_to_leg(uuid, uuid, text) TO authenticated;