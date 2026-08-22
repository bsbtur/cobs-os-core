-- W05: make operation-scoped crew responsibility the canonical source for driver eligibility.

create or replace function public.w05_operation_driver_candidates(_operation_id uuid)
returns table (
  person_id uuid,
  full_name text,
  participation_id uuid,
  participation_status public.participation_status,
  driver_id uuid,
  driver_is_active boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  _tenant_id uuid;
begin
  select o.tenant_id into _tenant_id
  from public.operations o
  where o.id = _operation_id;

  if _tenant_id is null then
    raise exception 'Operation not found';
  end if;

  perform app_private.w05_assert_role(_tenant_id);

  return query
  select distinct
    p.id,
    p.full_name,
    op.id,
    op.status,
    d.id,
    d.is_active
  from public.operation_participations op
  join public.people p
    on p.id = op.person_id
   and p.tenant_id = op.tenant_id
  join public.operation_role_assignments ora
    on ora.participation_id = op.id
   and ora.tenant_id = op.tenant_id
  join public.operation_role_types ort
    on ort.id = ora.role_type_id
   and ort.tenant_id = op.tenant_id
   and ort.key = 'driver'
   and ort.is_active = true
  left join public.drivers d
    on d.tenant_id = op.tenant_id
   and d.person_id = op.person_id
  where op.operation_id = _operation_id
    and op.tenant_id = _tenant_id
    and op.participation_kind = 'crew'
    and op.status <> 'cancelled'
  order by p.full_name, p.id;
end;
$$;

revoke all on function public.w05_operation_driver_candidates(uuid) from public, anon;
grant execute on function public.w05_operation_driver_candidates(uuid) to authenticated, service_role;

create or replace function public.assign_operation_driver_to_leg(
  _transport_leg_id uuid,
  _person_id uuid,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _leg public.transport_legs;
  _driver_id uuid;
  _eligible boolean;
  _result jsonb;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.w05_assert_open(_leg);

  select exists (
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

  insert into public.drivers (tenant_id, person_id, is_active, created_by)
  values (_leg.tenant_id, _person_id, true, auth.uid())
  on conflict (tenant_id, person_id)
  do update set is_active = true, updated_at = now()
  returning id into _driver_id;

  _result := public.assign_driver_to_leg(_transport_leg_id, _driver_id, _reason);

  return _result || jsonb_build_object('person_id', _person_id);
end;
$$;

revoke all on function public.assign_operation_driver_to_leg(uuid, uuid, text) from public, anon;
grant execute on function public.assign_operation_driver_to_leg(uuid, uuid, text) to authenticated, service_role;
