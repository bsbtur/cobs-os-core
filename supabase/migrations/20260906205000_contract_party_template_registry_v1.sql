-- COBS OS · Contract party + template registry v1
-- Additive foundation for versioned contract generation. No provider calls and no customer rows are created.

create table public.contract_party_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  document_type text not null default 'cpf' check (document_type in ('cpf','passport','other')),
  document_number text not null,
  address_line1 text not null,
  address_line2 text,
  district text,
  city text not null,
  state_region text not null,
  postal_code text not null,
  country_code char(2) not null default 'BR',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, person_id),
  foreign key (tenant_id, person_id) references public.people(tenant_id, id) on delete cascade,
  check (char_length(btrim(document_number)) between 3 and 64),
  check (char_length(btrim(address_line1)) between 3 and 240),
  check (char_length(btrim(city)) between 2 and 120),
  check (char_length(btrim(state_region)) between 2 and 120),
  check (char_length(btrim(postal_code)) between 3 and 24),
  check (country_code ~ '^[A-Z]{2}$')
);

create index contract_party_profiles_tenant_idx
  on public.contract_party_profiles(tenant_id, person_id);

alter table public.contract_party_profiles enable row level security;
create policy "Contract roles read party profiles"
  on public.contract_party_profiles for select to authenticated
  using (app_private.has_tenant_role(tenant_id,array['owner','admin','operations_agent']::public.app_role[]));
-- Contractual identity/address mutation stays behind trusted commands.
revoke all on public.contract_party_profiles from public,anon,authenticated;
grant select on public.contract_party_profiles to authenticated;
grant all on public.contract_party_profiles to service_role;

create trigger contract_party_profiles_updated_at
  before update on public.contract_party_profiles
  for each row execute function public.set_updated_at();

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_key text not null,
  version text not null,
  name text not null,
  locale text not null default 'pt-BR',
  status text not null default 'draft' check (status in ('draft','review_required','active','retired')),
  provider text not null default 'clicksign',
  provider_template_id text,
  variable_schema jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  legal_reviewed_at timestamptz,
  legal_reviewed_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, template_key, version),
  check (char_length(btrim(template_key)) between 3 and 120),
  check (char_length(btrim(version)) between 1 and 40),
  check (char_length(btrim(name)) between 3 and 200),
  check (status <> 'active' or legal_reviewed_at is not null),
  check (status <> 'active' or provider_template_id is not null)
);

create unique index contract_templates_active_key_uidx
  on public.contract_templates(tenant_id, template_key)
  where status='active';

alter table public.contract_templates enable row level security;
create policy "Contract roles read templates"
  on public.contract_templates for select to authenticated
  using (app_private.has_tenant_role(tenant_id,array['owner','admin','operations_agent']::public.app_role[]));
-- Templates are versioned and promoted only by trusted commands/migrations.
revoke all on public.contract_templates from public,anon,authenticated;
grant select on public.contract_templates to authenticated;
grant all on public.contract_templates to service_role;

create trigger contract_templates_updated_at
  before update on public.contract_templates
  for each row execute function public.set_updated_at();

comment on table public.contract_party_profiles is
  'Contract-only identity/address data kept separate from the canonical people directory.';
comment on table public.contract_templates is
  'Provider-neutral versioned contract template registry. Provider template IDs are integration metadata.';
