-- COBS OS · W05 Mobility QA hotfix
-- Keep Person canonical while making a contextual Motorista responsibility usable by Mobility.
-- A driver remains a reusable resource pointing to people; this trigger never creates a second identity.

create or replace function app_private.ensure_driver_resource_for_operation_role()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role_key text;
  v_person_id uuid;
  v_tenant_id uuid;
begin
  select rt.key
    into v_role_key
  from public.operation_role_types rt
  where rt.id = new.role_type_id
    and rt.tenant_id = new.tenant_id;

  if v_role_key is distinct from 'driver' then
    return new;
  end if;

  select op.person_id, op.tenant_id
    into v_person_id, v_tenant_id
  from public.operation_participations op
  where op.id = new.participation_id
    and op.tenant_id = new.tenant_id
    and op.status <> 'cancelled';

  if v_person_id is null then
    return new;
  end if;

  -- Re-enable an existing reusable driver resource when present.
  update public.drivers
     set is_active = true,
         updated_at = now()
   where tenant_id = v_tenant_id
     and person_id = v_person_id
     and is_active is distinct from true;

  -- Create the resource only when this Person has never been registered as a driver.
  if not exists (
    select 1
    from public.drivers d
    where d.tenant_id = v_tenant_id
      and d.person_id = v_person_id
  ) then
    insert into public.drivers (
      tenant_id,
      person_id,
      is_active,
      metadata
    ) values (
      v_tenant_id,
      v_person_id,
      true,
      '{}'::jsonb
    );
  end if;

  return new;
end;
$$;

revoke all on function app_private.ensure_driver_resource_for_operation_role() from public;

-- Covers both the add-person wizard and later responsibility changes.
drop trigger if exists trg_operation_role_assignment_ensure_driver on public.operation_role_assignments;
create trigger trg_operation_role_assignment_ensure_driver
after insert or update of role_type_id, participation_id
on public.operation_role_assignments
for each row
execute function app_private.ensure_driver_resource_for_operation_role();

-- Backfill existing active operation members already carrying the Motorista responsibility.
insert into public.drivers (
  tenant_id,
  person_id,
  is_active,
  metadata
)
select distinct
  op.tenant_id,
  op.person_id,
  true,
  '{}'::jsonb
from public.operation_role_assignments ora
join public.operation_role_types rt
  on rt.id = ora.role_type_id
 and rt.tenant_id = ora.tenant_id
join public.operation_participations op
  on op.id = ora.participation_id
 and op.tenant_id = ora.tenant_id
where rt.key = 'driver'
  and op.status <> 'cancelled'
  and not exists (
    select 1
    from public.drivers d
    where d.tenant_id = op.tenant_id
      and d.person_id = op.person_id
  );

-- Existing driver resources stay reusable. This hotfix intentionally does not retire
-- a driver when an operation role is removed; resource lifecycle remains owned by W05 Fleet.
