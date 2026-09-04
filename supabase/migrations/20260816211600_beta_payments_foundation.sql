create type public.payment_provider as enum ('mercado_pago');
create type public.payment_method_kind as enum ('pix', 'card', 'other');
create type public.payment_charge_status as enum ('draft', 'pending', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'partially_refunded');
create type public.payment_attempt_status as enum ('created', 'pending', 'processing', 'approved', 'rejected', 'cancelled', 'expired', 'refunded');

create table public.payment_charges (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade, order_id uuid not null,
  reservation_id uuid references public.commercial_reservations(id) on delete set null, provider public.payment_provider not null default 'mercado_pago',
  status public.payment_charge_status not null default 'draft', currency char(3) not null default 'BRL', amount_minor bigint not null check (amount_minor > 0),
  paid_amount_minor bigint not null default 0 check (paid_amount_minor >= 0), refunded_amount_minor bigint not null default 0 check (refunded_amount_minor >= 0),
  installment_number integer check (installment_number is null or installment_number >= 1), installment_count integer check (installment_count is null or installment_count >= 1),
  due_at timestamptz, external_reference text not null, provider_order_id text, description text, metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), paid_at timestamptz, cancelled_at timestamptz,
  constraint payment_charges_order_fk foreign key (tenant_id, order_id) references public.orders(tenant_id, id) on delete cascade,
  constraint payment_charges_amounts_ck check (paid_amount_minor <= amount_minor and refunded_amount_minor <= paid_amount_minor),
  constraint payment_charges_installments_ck check (installment_number is null or installment_count is null or installment_number <= installment_count),
  unique (tenant_id, id), unique (tenant_id, external_reference)
);
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade, charge_id uuid not null,
  provider public.payment_provider not null default 'mercado_pago', method public.payment_method_kind not null, status public.payment_attempt_status not null default 'created',
  amount_minor bigint not null check (amount_minor > 0), idempotency_key text not null, provider_order_id text, provider_payment_id text, provider_status text, provider_status_detail text,
  pix_qr_code text, pix_qr_code_base64 text, pix_ticket_url text, expires_at timestamptz, request_snapshot jsonb not null default '{}'::jsonb,
  response_snapshot jsonb not null default '{}'::jsonb, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), approved_at timestamptz,
  constraint payment_attempts_charge_fk foreign key (tenant_id, charge_id) references public.payment_charges(tenant_id, id) on delete cascade,
  unique (tenant_id, idempotency_key), unique (tenant_id, provider, provider_payment_id)
);
create table public.payment_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade, charge_id uuid references public.payment_charges(id) on delete cascade,
  attempt_id uuid references public.payment_attempts(id) on delete cascade, provider public.payment_provider not null default 'mercado_pago', event_type text not null,
  provider_event_id text, provider_resource_id text, signature_valid boolean, payload jsonb not null default '{}'::jsonb, occurred_at timestamptz,
  received_at timestamptz not null default now(), processed_at timestamptz, processing_error text, unique (provider, provider_event_id)
);
create index payment_charges_order_idx on public.payment_charges (tenant_id, order_id);
create index payment_charges_status_due_idx on public.payment_charges (tenant_id, status, due_at);
create index payment_attempts_charge_idx on public.payment_attempts (tenant_id, charge_id, created_at desc);
create index payment_attempts_provider_order_idx on public.payment_attempts (provider, provider_order_id);
create index payment_events_resource_idx on public.payment_events (provider, provider_resource_id, received_at desc);
alter table public.payment_charges enable row level security; alter table public.payment_attempts enable row level security; alter table public.payment_events enable row level security;
create policy payment_charges_commerce_read on public.payment_charges for select to authenticated using (app_private.has_tenant_role(tenant_id, array['owner'::public.app_role, 'admin'::public.app_role, 'operations_agent'::public.app_role]));
create policy payment_attempts_commerce_read on public.payment_attempts for select to authenticated using (app_private.has_tenant_role(tenant_id, array['owner'::public.app_role, 'admin'::public.app_role, 'operations_agent'::public.app_role]));
create policy payment_events_commerce_read on public.payment_events for select to authenticated using (app_private.has_tenant_role(tenant_id, array['owner'::public.app_role, 'admin'::public.app_role, 'operations_agent'::public.app_role]));
comment on table public.payment_charges is 'Provider-agnostic receivables/cobrancas linked to COBS orders.';
comment on table public.payment_attempts is 'Individual Pix/card provider attempts with mandatory idempotency.';
comment on table public.payment_events is 'Inbound/outbound payment event evidence and webhook deduplication.';