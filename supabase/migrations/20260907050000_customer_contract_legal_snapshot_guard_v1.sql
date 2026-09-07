-- COBS OS · Customer contract legal snapshot guard v1
-- Defense-in-depth at the database boundary for CIOSP-2027 contracts.
-- A draft can only be persisted when its exact template and privacy-policy snapshot
-- still point to active, formally reviewed legal evidence.

create or replace function app_private.guard_customer_contract_legal_snapshot()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_snapshot jsonb;
  v_snapshot_template jsonb;
  v_snapshot_privacy jsonb;
  v_policy_key text;
  v_policy_version text;
  v_policy_hash text;
  v_template_key text;
  v_template_version text;
  v_template_ok boolean := false;
  v_privacy_ok boolean := false;
begin
  if new.template_key <> 'CIOSP-2027' then
    return new;
  end if;

  v_snapshot := new.metadata->'contract_snapshot';
  if jsonb_typeof(v_snapshot) <> 'object' then
    raise exception 'contract_legal_snapshot_required';
  end if;

  v_snapshot_template := v_snapshot->'template';
  v_snapshot_privacy := v_snapshot->'privacy_policy';
  if jsonb_typeof(v_snapshot_template) <> 'object' then
    raise exception 'contract_template_snapshot_required';
  end if;
  if jsonb_typeof(v_snapshot_privacy) <> 'object' then
    raise exception 'contract_privacy_snapshot_required';
  end if;

  v_template_key := nullif(btrim(coalesce(v_snapshot_template->>'key','')),'');
  v_template_version := nullif(btrim(coalesce(v_snapshot_template->>'version','')),'');
  if v_template_key is null or v_template_version is null
     or v_template_key <> new.template_key
     or v_template_version <> new.template_version then
    raise exception 'contract_template_snapshot_mismatch';
  end if;

  select true
  into v_template_ok
  from public.contract_templates ct
  where ct.tenant_id = new.tenant_id
    and ct.template_key = new.template_key
    and ct.version = new.template_version
    and ct.status = 'active'
    and ct.legal_reviewed_at is not null
  limit 1;

  if coalesce(v_template_ok,false) is not true then
    raise exception 'contract_template_formal_legal_review_required';
  end if;

  v_policy_key := nullif(btrim(coalesce(v_snapshot_privacy->>'policy_key','')),'');
  v_policy_version := nullif(btrim(coalesce(v_snapshot_privacy->>'version','')),'');
  v_policy_hash := nullif(btrim(coalesce(v_snapshot_privacy->>'content_hash','')),'');
  if v_policy_key is null or v_policy_version is null or v_policy_hash is null then
    raise exception 'contract_privacy_snapshot_incomplete';
  end if;

  select true
  into v_privacy_ok
  from public.privacy_policy_versions p
  where p.tenant_id = new.tenant_id
    and p.policy_key = v_policy_key
    and p.version = v_policy_version
    and p.status = 'active'
    and p.effective_at <= now()
    and p.content_hash = v_policy_hash
    and p.legal_reviewed_at is not null
    and nullif(btrim(coalesce(p.legal_review_reference,'')),'') is not null
  limit 1;

  if coalesce(v_privacy_ok,false) is not true then
    raise exception 'contract_privacy_formal_legal_review_required';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_customer_contract_legal_snapshot() from public;

drop trigger if exists customer_contracts_legal_snapshot_guard on public.customer_contracts;
create trigger customer_contracts_legal_snapshot_guard
before insert or update of tenant_id,template_key,template_version,metadata
on public.customer_contracts
for each row execute function app_private.guard_customer_contract_legal_snapshot();

comment on function app_private.guard_customer_contract_legal_snapshot() is
  'For CIOSP-2027, validates exact active/formally-reviewed template and privacy-policy evidence before a customer contract can be persisted.';

comment on trigger customer_contracts_legal_snapshot_guard on public.customer_contracts is
  'Defense-in-depth: CIOSP-2027 contract rows cannot bypass formal template/privacy legal evidence through legacy active records or manual inserts.';
