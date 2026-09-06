-- COBS OS · CIOSP 2027 contract template registry v1
-- Registers the canonical variable contract only. It does NOT activate a Clicksign template,
-- create customer contracts, render documents, or send anything to a provider.

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
  t.id,
  'CIOSP-2027',
  'V1',
  'Contrato de Intermediação de Serviços Turísticos — CIOSP 2027',
  'pt-BR',
  'review_required',
  'clicksign',
  null,
  jsonb_build_object(
    'schema_version', 1,
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
      'grand_total_minor',
      'order_items'
    ),
    'optional', jsonb_build_array(
      'customer_address_line2',
      'customer_district',
      'customer_country_code',
      'operation_code',
      'reservation_id',
      'payment_plan',
      'package_name'
    )
  ),
  jsonb_build_object(
    'program', 'CIOSP 2027',
    'commercial_year', 2027,
    'legal_source', 'CIOSP 2026 contract structure; adapted contract text still requires legal review',
    'activation_guard', 'legal_review_and_clicksign_template_required',
    'generation_mode', 'immutable_order_snapshot',
    'provider_document_mode', 'template',
    'notes', 'Signing date is dynamic. Operation dates, package contents, price and payment plan must come from canonical COBS data; no customer commercial values are hardcoded.'
  )
from public.tenants t
where lower(coalesce(t.name, '')) like '%bsbtur%'
on conflict (tenant_id, template_key, version) do nothing;

comment on table public.contract_templates is
  'Provider-neutral versioned contract template registry. CIOSP-2027/V1 remains review_required until legal review and provider template linkage are explicitly completed.';
