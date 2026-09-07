-- COBS OS · Contract legal evidence V3.1
-- Additive foundation for immutable supplier/privacy evidence.
-- No template activation, customer contract generation, provider call or payment mutation.

alter table public.suppliers
  add column if not exists legal_name text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists state_region text,
  add column if not exists postal_code text,
  add column if not exists country_code text;

comment on column public.suppliers.document_number is
  'Supplier CNPJ or equivalent legal identifier. Required by contract preflight when the supplier is disclosed in a tourism package.';
comment on column public.suppliers.legal_name is
  'Supplier legal/corporate name used in contractual evidence.';
comment on column public.suppliers.address_line1 is
  'Supplier commercial address line 1 used in contractual evidence.';

create table if not exists public.privacy_policy_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  policy_key text not null,
  version text not null,
  title text not null,
  effective_at timestamptz not null,
  content_hash text not null,
  public_url text,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, policy_key, version)
);

create unique index if not exists privacy_policy_versions_one_active_uidx
  on public.privacy_policy_versions(tenant_id, policy_key)
  where status='active';

alter table public.privacy_policy_versions enable row level security;

create policy privacy_policy_versions_read_staff
  on public.privacy_policy_versions for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

revoke insert, update, delete on public.privacy_policy_versions from authenticated, anon;
grant select on public.privacy_policy_versions to authenticated;

comment on table public.privacy_policy_versions is
  'Version registry used to freeze the exact privacy policy evidence associated with a customer contract.';

-- Register V3.1 as a review-only successor. It remains deliberately inactive.
insert into public.contract_templates (
  tenant_id, template_key, version, name, locale, status, provider,
  provider_template_id, variable_schema, metadata
)
select
  v3.tenant_id,
  'CIOSP-2027',
  'V3.1',
  'Contrato de Intermediação de Serviços Turísticos — CIOSP 2027 — V3.1',
  'pt-BR',
  'review_required',
  'clicksign',
  null,
  jsonb_build_object(
    'schema_version', 31,
    'required', jsonb_build_array(
      'contract_date','customer_full_name','customer_document_type','customer_document_number',
      'customer_email','customer_phone','customer_address_line1','customer_city','customer_state_region',
      'customer_postal_code','operation_name','operation_start','operation_end','destination_city',
      'destination_region','order_id','currency','grand_total_formatted','grand_total_in_words',
      'payment_plan_display','order_items','contracted_suppliers','privacy_policy_version',
      'privacy_policy_effective_at'
    ),
    'optional', jsonb_build_array(
      'customer_address_line2','customer_district','customer_country_code','operation_code',
      'reservation_id','package_name'
    )
  ),
  coalesce(v3.metadata,'{}'::jsonb) || jsonb_build_object(
    'legal_status','technical_review_passed_formal_legal_validation_pending',
    'generation_mode','immutable_order_snapshot_v2',
    'provider_document_mode','upload',
    'requires_supplier_snapshot',true,
    'requires_supplier_legal_identity',true,
    'requires_offer_snapshot',true,
    'requires_payment_schedule_snapshot',true,
    'requires_privacy_policy_version',true,
    'requires_placeholder_preflight',true,
    'activation_guard','formal_legal_validation_required',
    'notes','V3.1 incorporates technical legal audit corrections. It remains review_required and must not be sent before formal legal validation.'
  )
from public.contract_templates v3
where v3.template_key='CIOSP-2027' and v3.version='V3'
on conflict (tenant_id, template_key, version) do nothing;
