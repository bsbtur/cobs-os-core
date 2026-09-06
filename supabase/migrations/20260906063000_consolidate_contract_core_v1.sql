-- COBS OS · Contract core consolidation
-- Provider-neutral contract ledger. No STAGING contract/event rows are copied.

create table public.customer_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  reservation_id uuid references public.commercial_reservations(id) on delete set null,
  customer_person_id uuid not null references public.people(id) on delete restrict,
  template_key text not null,
  template_version text not null,
  provider text not null,
  provider_envelope_id text,
  status text not null default 'draft' check (status in ('draft','sent','viewed','signed','cancelled','expired','superseded')),
  original_document_path text,
  signed_document_path text,
  document_hash text,
  provider_document_hash text,
  signer_name text,
  signer_document text,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  superseded_by uuid references public.customer_contracts(id) on delete set null,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'signed' or signed_at is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);

create unique index customer_contracts_provider_envelope_uidx on public.customer_contracts(provider,provider_envelope_id) where provider_envelope_id is not null;
create index customer_contracts_operation_status_idx on public.customer_contracts(operation_id,status);
create index customer_contracts_customer_idx on public.customer_contracts(customer_person_id,operation_id);
create index customer_contracts_order_idx on public.customer_contracts(order_id) where order_id is not null;

alter table public.customer_contracts enable row level security;
create policy "Operation roles read customer contracts" on public.customer_contracts for select to authenticated using (app_private.has_tenant_role(tenant_id,array['owner','admin','operations_agent']::public.app_role[]));
-- Contract mutation is intentionally service-command/provider controlled in canonical COBS.
revoke all on public.customer_contracts from public,anon,authenticated;
grant select on public.customer_contracts to authenticated;
grant all on public.customer_contracts to service_role;

create table public.contract_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null references public.customer_contracts(id) on delete cascade,
  event_type text not null check (event_type in ('created','sent','viewed','signed','completed','cancelled','expired','superseded','reminder_sent','provider_error','document_archived')),
  provider_event_id text,
  correlation_id text,
  source text not null check (source in ('cobs','provider','user','system','n8n')),
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index contract_events_provider_event_uidx on public.contract_events(provider_event_id) where provider_event_id is not null;
create index contract_events_contract_time_idx on public.contract_events(contract_id,event_at desc);
create index contract_events_tenant_time_idx on public.contract_events(tenant_id,event_at desc);

alter table public.contract_events enable row level security;
create policy "Operation roles read contract events" on public.contract_events for select to authenticated using (app_private.has_tenant_role(tenant_id,array['owner','admin','operations_agent']::public.app_role[]));
-- Event ledger is append-only through trusted service/provider commands; clients cannot mutate it directly.
revoke all on public.contract_events from public,anon,authenticated;
grant select on public.contract_events to authenticated;
grant all on public.contract_events to service_role;

create or replace view public.operation_contract_summary
with (security_invoker=true) as
select tenant_id,operation_id,
  count(*)::integer total_contracts,
  count(*) filter(where status='draft')::integer draft_contracts,
  count(*) filter(where status='sent')::integer sent_contracts,
  count(*) filter(where status='viewed')::integer viewed_contracts,
  count(*) filter(where status='signed')::integer signed_contracts,
  count(*) filter(where status='cancelled')::integer cancelled_contracts,
  count(*) filter(where status='expired')::integer expired_contracts,
  count(*) filter(where status='superseded')::integer superseded_contracts,
  count(*) filter(where status in ('sent','viewed'))::integer awaiting_signature_contracts
from public.customer_contracts
group by tenant_id,operation_id;

revoke all on public.operation_contract_summary from public,anon;
grant select on public.operation_contract_summary to authenticated,service_role;
