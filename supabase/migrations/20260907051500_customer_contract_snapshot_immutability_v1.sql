-- COBS OS · Customer contract snapshot immutability v1
-- Once a CIOSP-2027 contract snapshot exists, its frozen commercial/legal evidence
-- cannot be altered through later metadata updates. Operational/provider metadata
-- outside contract_snapshot may continue to evolve normally.

create or replace function app_private.guard_customer_contract_snapshot_immutability()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_old_snapshot jsonb;
  v_new_snapshot jsonb;
begin
  if old.template_key <> 'CIOSP-2027' then
    return new;
  end if;

  v_old_snapshot := old.metadata->'contract_snapshot';
  v_new_snapshot := new.metadata->'contract_snapshot';

  if jsonb_typeof(v_old_snapshot) = 'object'
     and v_old_snapshot is distinct from v_new_snapshot then
    raise exception 'contract_snapshot_immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_customer_contract_snapshot_immutability() from public;

drop trigger if exists customer_contracts_snapshot_immutability_guard on public.customer_contracts;
create trigger customer_contracts_snapshot_immutability_guard
before update of metadata
on public.customer_contracts
for each row execute function app_private.guard_customer_contract_snapshot_immutability();

comment on function app_private.guard_customer_contract_snapshot_immutability() is
  'Prevents mutation or removal of an existing CIOSP-2027 contract_snapshot while allowing unrelated provider/operational metadata updates.';

comment on trigger customer_contracts_snapshot_immutability_guard on public.customer_contracts is
  'Freezes CIOSP-2027 commercial/legal contract evidence after persistence.';
