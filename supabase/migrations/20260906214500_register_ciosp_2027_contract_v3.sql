-- COBS OS · CIOSP 2027 contract V3 registry + live-contract idempotency
-- Additive only. Preserves V1. Does not activate a template, create a customer contract,
-- render a document, call Clicksign, or send anything.

-- One live contract per order + template version. Fail closed if legacy duplicates exist.
do $$
begin
  if exists (
    select 1
      from public.customer_contracts
     where order_id is not null
       and status in ('draft','sent','viewed','signed')
     group by tenant_id, order_id, template_key, template_version
    having count(*) > 1
  ) then
    raise exception 'customer_contracts contains duplicate live order/template/version rows; reconcile before V3 idempotency index';
  end if;
end $$;

create unique index if not exists customer_contracts_live_order_template_uidx
  on public.customer_contracts (tenant_id, order_id, template_key, template_version)
  where order_id is not null
    and status in ('draft','sent','viewed','signed');

-- Seed V3 only for tenants that already have the canonical CIOSP-2027/V1 registry row.
-- This avoids tenant-name matching and preserves V1 as immutable history.
insert into public.contract_templates (
  tenant_id,
  template_key,
  version,
  name,
  locale,
  status,
  provider,
  provider_template_id,
  variable_schema,
  metadata
)
select
  v1.tenant_id,
  'CIOSP-2027',
  'V3',
  'Contrato de Intermediação de Serviços Turísticos — CIOSP 2027 — V3',
  'pt-BR',
  'review_required',
  'clicksign',
  null,
  jsonb_build_object(
    'schema_version', 3,
    'required', jsonb_build_array(
      'contract_date',
      'customer_full_name',
      'customer_document_type',
      'customer_document_number',
      'customer_email',
      'customer_phone',
      'customer_address_line1',
      'customer_city',
      'customer_state_region',
      'customer_postal_code',
      'operation_name',
      'operation_start',
      'operation_end',
      'destination_city',
      'destination_region',
      'order_id',
      'currency',
      'grand_total_formatted',
      'grand_total_in_words',
      'payment_plan_display',
      'order_items'
    ),
    'optional', jsonb_build_array(
      'customer_address_line2',
      'customer_district',
      'customer_country_code',
      'operation_code',
      'reservation_id',
      'package_name'
    )
  ),
  jsonb_build_object(
    'program', 'CIOSP 2027',
    'commercial_year', 2027,
    'legal_status', 'candidate_final_pending_formal_legal_validation',
    'generation_mode', 'immutable_order_snapshot_v2',
    'provider_boundary', 'generate_before_provider_send',
    'provider_document_mode', 'upload',
    'requires_offer_snapshot', true,
    'requires_payment_schedule_snapshot', true,
    'requires_privacy_policy_version', true,
    'activation_guard', 'formal_legal_validation_required',
    'notes', 'V3 is registered as review_required. No activation or provider linkage occurs in this migration.'
  )
from public.contract_templates v1
where v1.template_key = 'CIOSP-2027'
  and v1.version = 'V1'
on conflict (tenant_id, template_key, version) do nothing;

comment on index public.customer_contracts_live_order_template_uidx is
  'Prevents concurrent duplicate live contracts for the same tenant/order/template/version.';
