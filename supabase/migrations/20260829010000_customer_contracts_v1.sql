create table if not exists public.customer_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  order_id uuid null references public.orders(id) on delete set null,
  reservation_id uuid null references public.commercial_reservations(id) on delete set null,
  customer_person_id uuid not null references public.people(id) on delete restrict,
  template_key text not null,
  template_version text not null,
  provider text not null default 'clicksign',
  provider_envelope_id text null,
  status text not null default 'draft' check (status in ('draft','sent','viewed','signed','cancelled','expired','superseded')),
  original_document_path text null,
  signed_document_path text null,
  document_hash text null,
  provider_document_hash text null,
  signer_name text null,
  signer_document text null,
  sent_at timestamptz null,
  viewed_at timestamptz null,
  signed_at timestamptz null,
  cancelled_at timestamptz null,
  expires_at timestamptz null,
  superseded_by uuid null references public.customer_contracts(id) on delete set null,
  cancellation_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contracts_signed_requires_timestamp check (status <> 'signed' or signed_at is not null),
  constraint customer_contracts_cancelled_requires_timestamp check (status <> 'cancelled' or cancelled_at is not null)
);

create unique index if not exists customer_contracts_provider_envelope_uidx
  on public.customer_contracts(provider, provider_envelope_id)
  where provider_envelope_id is not null;
create index if not exists customer_contracts_operation_status_idx on public.customer_contracts(operation_id, status);
create index if not exists customer_contracts_customer_idx on public.customer_contracts(customer_person_id, operation_id);
create index if not exists customer_contracts_order_idx on public.customer_contracts(order_id) where order_id is not null;

create table if not exists public.contract_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null references public.customer_contracts(id) on delete cascade,
  event_type text not null check (event_type in ('created','sent','viewed','signed','completed','cancelled','expired','superseded','reminder_sent','provider_error','document_archived')),
  provider_event_id text null,
  correlation_id text null,
  source text not null default 'cobs' check (source in ('cobs','provider','user','system','n8n')),
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists contract_events_provider_event_uidx
  on public.contract_events(provider_event_id)
  where provider_event_id is not null;
create index if not exists contract_events_contract_time_idx on public.contract_events(contract_id, event_at desc);
create index if not exists contract_events_tenant_time_idx on public.contract_events(tenant_id, event_at desc);

alter table public.customer_contracts enable row level security;
alter table public.contract_events enable row level security;

create policy customer_contracts_read_ops on public.customer_contracts
for select to authenticated
using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

create policy customer_contracts_write_admin on public.customer_contracts
for insert to authenticated
with check (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

create policy customer_contracts_update_admin on public.customer_contracts
for update to authenticated
using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]))
with check (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

create policy contract_events_read_ops on public.contract_events
for select to authenticated
using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

create policy contract_events_write_ops on public.contract_events
for insert to authenticated
with check (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

revoke all on public.customer_contracts from anon;
revoke all on public.contract_events from anon;
grant select,insert,update on public.customer_contracts to authenticated;
grant select,insert on public.contract_events to authenticated;

create trigger customer_contracts_set_updated_at
before update on public.customer_contracts
for each row execute function public.set_updated_at();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('customer-contracts','customer-contracts',false,20971520,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy customer_contracts_storage_read_ops on storage.objects
for select to authenticated
using (
  bucket_id='customer-contracts'
  and exists (
    select 1 from public.memberships m
    where m.profile_id=auth.uid()
      and m.status='active'
      and m.tenant_id::text=(storage.foldername(name))[1]
      and m.role=any(array['owner','admin','operations_agent']::public.app_role[])
  )
);

create policy customer_contracts_storage_insert_ops on storage.objects
for insert to authenticated
with check (
  bucket_id='customer-contracts'
  and exists (
    select 1 from public.memberships m
    where m.profile_id=auth.uid()
      and m.status='active'
      and m.tenant_id::text=(storage.foldername(name))[1]
      and m.role=any(array['owner','admin','operations_agent']::public.app_role[])
  )
);

create policy customer_contracts_storage_update_ops on storage.objects
for update to authenticated
using (
  bucket_id='customer-contracts'
  and exists (
    select 1 from public.memberships m
    where m.profile_id=auth.uid()
      and m.status='active'
      and m.tenant_id::text=(storage.foldername(name))[1]
      and m.role=any(array['owner','admin','operations_agent']::public.app_role[])
  )
)
with check (
  bucket_id='customer-contracts'
  and exists (
    select 1 from public.memberships m
    where m.profile_id=auth.uid()
      and m.status='active'
      and m.tenant_id::text=(storage.foldername(name))[1]
      and m.role=any(array['owner','admin','operations_agent']::public.app_role[])
  )
);

create policy customer_contracts_storage_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id='customer-contracts'
  and exists (
    select 1 from public.memberships m
    where m.profile_id=auth.uid()
      and m.status='active'
      and m.tenant_id::text=(storage.foldername(name))[1]
      and m.role=any(array['owner','admin']::public.app_role[])
  )
);

create or replace view public.operation_contract_summary
with (security_invoker=true)
as
select
  tenant_id,
  operation_id,
  count(*)::int as total_contracts,
  count(*) filter (where status='draft')::int as draft_contracts,
  count(*) filter (where status='sent')::int as sent_contracts,
  count(*) filter (where status='viewed')::int as viewed_contracts,
  count(*) filter (where status='signed')::int as signed_contracts,
  count(*) filter (where status='cancelled')::int as cancelled_contracts,
  count(*) filter (where status='expired')::int as expired_contracts,
  count(*) filter (where status='superseded')::int as superseded_contracts,
  count(*) filter (where status in ('sent','viewed'))::int as awaiting_signature_contracts
from public.customer_contracts
group by tenant_id,operation_id;

grant select on public.operation_contract_summary to authenticated;
