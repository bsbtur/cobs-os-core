-- COBS OS · Customer contract document artifact immutability v1
-- Allows the renderer to persist the first frozen PDF artifact for CIOSP-2027,
-- then prevents replacement or removal of its path/hash on later updates.

create or replace function app_private.guard_customer_contract_document_artifact_immutability()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if old.template_key <> 'CIOSP-2027' then
    return new;
  end if;

  -- The renderer may persist the initial artifact once. After either frozen field
  -- exists, both values are immutable. This still allows status/metadata/provider
  -- updates that leave the artifact untouched.
  if old.original_document_path is not null
     and old.original_document_path is distinct from new.original_document_path then
    raise exception 'contract_document_artifact_immutable';
  end if;

  if old.document_hash is not null
     and old.document_hash is distinct from new.document_hash then
    raise exception 'contract_document_artifact_immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_customer_contract_document_artifact_immutability() from public;

drop trigger if exists customer_contracts_document_artifact_immutability_guard on public.customer_contracts;
create trigger customer_contracts_document_artifact_immutability_guard
before update of original_document_path, document_hash
on public.customer_contracts
for each row execute function app_private.guard_customer_contract_document_artifact_immutability();

comment on function app_private.guard_customer_contract_document_artifact_immutability() is
  'Prevents replacement or removal of an already persisted CIOSP-2027 original PDF path/hash while allowing the first renderer write.';

comment on trigger customer_contracts_document_artifact_immutability_guard on public.customer_contracts is
  'Freezes the persisted CIOSP-2027 PDF artifact after its initial renderer write.';
