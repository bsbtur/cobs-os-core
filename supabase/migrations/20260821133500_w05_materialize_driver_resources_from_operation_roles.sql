-- Bridge contextual operation role `driver` to the existing W05 driver resource.
-- Person remains canonical identity; drivers is only a tenant-scoped Mobility resource.

create or replace function public.materialize_driver_resource_from_operation_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _role_key text;
  _person_id uuid;
  _tenant_id uuid;
begin
  select rt.key into _role_key
  from public.operation_role_types rt
  where rt.id = new.role_type_id and rt.tenant_id = new.tenant_id;

  if _role_key is distinct from 'driver' then return new; end if;

  select op.person_id, op.tenant_id into _person_id, _tenant_id
  from public.operation_participations op
  where op.id = new.participation_id
    and op.tenant_id = new.tenant_id
    and op.status <> 'cancelled';

  if _person_id is null then return new; end if;

  perform set_config('app.w05_control', 'on', true);
  insert into public.drivers (tenant_id, person_id, is_active, created_by)
  values (_tenant_id, _person_id, true, auth.uid())
  on conflict (tenant_id, person_id) do update set is_active = true;
  perform set_config('app.w05_control', 'off', true);

  return new;
end;
$$;

revoke all on function public.materialize_driver_resource_from_operation_role() from public;

drop trigger if exists operation_role_assignments_materialize_driver on public.operation_role_assignments;
create trigger operation_role_assignments_materialize_driver
after insert or update of role_type_id, participation_id
on public.operation_role_assignments
for each row
execute function public.materialize_driver_resource_from_operation_role();

select set_config('app.w05_control', 'on', true);
insert into public.drivers (tenant_id, person_id, is_active, created_by)
select distinct op.tenant_id, op.person_id, true, null::uuid
from public.operation_participations op
join public.operation_role_assignments ora
  on ora.participation_id = op.id and ora.tenant_id = op.tenant_id
join public.operation_role_types rt
  on rt.id = ora.role_type_id and rt.tenant_id = ora.tenant_id
where op.status <> 'cancelled' and rt.key = 'driver'
on conflict (tenant_id, person_id) do update set is_active = true;
select set_config('app.w05_control', 'off', true);
