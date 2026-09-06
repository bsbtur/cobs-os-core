-- COBS OS · CIOSP 2027 contract V3 synchronization
-- Additive only: preserves V1, registers V3 as review_required, and decouples
-- canonical contract activation from any specific signature provider template.

alter table public.contract_templates
  drop constraint if exists contract_templates_check1;

-- PostgreSQL generated the provider-template activation check without a stable
-- explicit name in the original migration. Drop it by definition when present.
do $$
declare r record;
begin
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.contract_templates'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%provider_template_id%'
       and pg_get_constraintdef(oid) ilike '%active%'
  loop
    execute format('alter table public.contract_templates drop constraint %I', r.conname);
  end loop;
end $$;

insert into public.contract_templates (
  tenant_id, template_key, version, name, locale, status, provider,
  provider_template_id, variable_schema, metadata
)
select
  t.id,
  'CIOSP-2027',
  'V3',
  'Contrato de Intermediação de Serviços Turísticos — CIOSP 2027',
  'pt-BR',
  'review_required',
  'clicksign',
  null,
  jsonb_build_object(
    'schema_version', 3,
    'required', jsonb_build_array(
      'contract_date','customer_full_name','customer_document_type',
      'customer_document_number','customer_email','customer_phone',
      'customer_address_line1','customer_city','customer_state_region',
      'customer_postal_code','operation_name','operation_start','operation_end',
      'destination_city','destination_region','order_id','currency',
      'grand_total_formatted','grand_total_in_words','payment_plan_display',
      'order_items','offer_snapshot'
    ),
    'optional', jsonb_build_array(
      'customer_address_line2','customer_district','customer_country_code',
      'operation_code','reservation_id','package_name','privacy_policy_version'
    )
  ),
  jsonb_build_object(
    'program','CIOSP 2027',
    'commercial_year',2027,
    'legal_status','candidate_final_requires_formal_legal_validation',
    'generation_mode','immutable_order_snapshot_v2',
    'provider_document_mode','upload',
    'provider_neutral_generation',true,
    'notes','Generate freezes the COBS contract before any signature-provider call. Provider send remains a separate explicit action.'
  )
from public.tenants t
where lower(coalesce(t.name,'')) like '%bsbtur%'
on conflict (tenant_id, template_key, version) do nothing;

-- Prevent concurrent duplicate live contracts for the same order/template version.
create unique index if not exists customer_contracts_live_order_template_uidx
  on public.customer_contracts (tenant_id, order_id, template_key, template_version)
  where order_id is not null and status in ('draft','sent','viewed','signed');

comment on table public.contract_templates is
  'Provider-neutral versioned contract template registry. Legal activation is independent from signature-provider template linkage.';
