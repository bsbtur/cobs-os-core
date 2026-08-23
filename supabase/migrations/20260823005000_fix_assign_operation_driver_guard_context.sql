create or replace function public.assign_operation_driver_to_leg(
  _transport_leg_id uuid,
  _person_id uuid,
  _reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _leg public.transport_legs;
  _driver_id uuid;
  _eligible boolean;
  _result jsonb;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);

  select exists(
    select 1
    from public.operation_participations op
    join public.operation_role_assignments ora
      on ora.participation_id = op.id
     and ora.tenant_id = op.tenant_id
    join public.operation_role_types ort
      on ort.id = ora.role_type_id
     and ort.tenant_id = op.tenant_id
    where op.operation_id = _leg.operation_id
      and op.tenant_id = _leg.tenant_id
      and op.person_id = _person_id
      and op.participation_kind = 'crew'
      and op.status <> 'cancelled'
      and ort.key = 'driver'
      and ort.is_active = true
  ) into _eligible;

  if not _eligible then
    raise exception 'Person is not an eligible driver for this operation';
  end if;

  -- `drivers` is protected by guard_w05_mutation. This wrapper is itself an
  -- approved W05 command, so materialization/reactivation must run inside the
  -- same command context used by the rest of the W05 mutation API.
  perform set_config('app.w05_control', 'on', true);
  insert into public.drivers(tenant_id, person_id, is_active, created_by)
  values (_leg.tenant_id, _person_id, true, auth.uid())
  on conflict (tenant_id, person_id)
  do update set is_active = true, updated_at = now()
  returning id into _driver_id;
  perform set_config('app.w05_control', 'off', true);

  _result := public.assign_driver_to_leg(_transport_leg_id, _driver_id, _reason);
  return _result || jsonb_build_object('person_id', _person_id);
end;
$function$;

revoke all on function public.assign_operation_driver_to_leg(uuid,uuid,text) from public, anon;
grant execute on function public.assign_operation_driver_to_leg(uuid,uuid,text) to authenticated, service_role;

comment on function public.assign_operation_driver_to_leg(uuid,uuid,text) is
'Assigns an operation-scoped eligible driver to a transport leg, materializing/reactivating the driver resource inside the approved W05 mutation guard context.';

notify pgrst, 'reload schema';
