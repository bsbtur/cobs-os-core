-- Fail-closed atomic claim for the first external Clicksign envelope creation.
-- Repository-only until explicitly migrated to production.
create or replace function app_private.claim_clicksign_envelope_creation(_contract_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_contract public.customer_contracts%rowtype;
  v_metadata jsonb;
begin
  select *
    into v_contract
    from public.customer_contracts
   where id = _contract_id
   for update;

  if not found then
    return false;
  end if;

  if v_contract.provider <> 'clicksign'
     or v_contract.status <> 'draft'
     or v_contract.provider_envelope_id is not null then
    return false;
  end if;

  v_metadata := coalesce(v_contract.metadata, '{}'::jsonb);

  if v_metadata ? 'clicksign_envelope_attempted_at' then
    return false;
  end if;

  update public.customer_contracts
     set metadata = v_metadata || jsonb_build_object(
       'clicksign_envelope_attempted_at', clock_timestamp()
     )
   where id = v_contract.id;

  return true;
end;
$$;

revoke all on function app_private.claim_clicksign_envelope_creation(uuid) from public;
revoke all on function app_private.claim_clicksign_envelope_creation(uuid) from anon;
revoke all on function app_private.claim_clicksign_envelope_creation(uuid) from authenticated;
grant execute on function app_private.claim_clicksign_envelope_creation(uuid) to service_role;
