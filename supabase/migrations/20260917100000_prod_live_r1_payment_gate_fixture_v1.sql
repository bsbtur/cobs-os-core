-- PROD LIVE R$1 payment release-gate fixture contract.
-- This migration intentionally creates NO order, NO charge, NO payment attempt
-- and performs NO provider call. It only installs an auditable one-shot gate
-- table used to authorize exactly one controlled BRL 1.00 release-gate fixture.

create table if not exists app_private.prod_live_payment_gates (
  id uuid primary key default gen_random_uuid(),
  gate_key text not null unique,
  amount_minor bigint not null,
  currency text not null,
  provider text not null,
  method text not null,
  environment text not null,
  status text not null default 'locked',
  fixture_order_id uuid null references public.orders(id) on delete restrict,
  authorized_at timestamptz null,
  consumed_at timestamptz null,
  retired_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prod_live_payment_gates_amount_ck check (amount_minor = 100),
  constraint prod_live_payment_gates_currency_ck check (currency = 'BRL'),
  constraint prod_live_payment_gates_provider_ck check (provider = 'mercado_pago'),
  constraint prod_live_payment_gates_method_ck check (method = 'pix'),
  constraint prod_live_payment_gates_environment_ck check (environment = 'production'),
  constraint prod_live_payment_gates_status_ck check (status in ('locked','authorized','consumed','retired')),
  constraint prod_live_payment_gates_authorization_ck check (
    (status = 'locked' and authorized_at is null and consumed_at is null) or
    (status = 'authorized' and authorized_at is not null and consumed_at is null and retired_at is null) or
    (status = 'consumed' and authorized_at is not null and consumed_at is not null) or
    (status = 'retired' and retired_at is not null)
  )
);

revoke all on table app_private.prod_live_payment_gates from public, anon, authenticated;
grant select, insert, update on table app_private.prod_live_payment_gates to service_role;

insert into app_private.prod_live_payment_gates (
  gate_key,
  amount_minor,
  currency,
  provider,
  method,
  environment,
  status
)
values (
  'prod-live-r1-payment-gate-v1',
  100,
  'BRL',
  'mercado_pago',
  'pix',
  'production',
  'locked'
)
on conflict (gate_key) do nothing;

comment on table app_private.prod_live_payment_gates is
  'One-shot authorization state for the isolated PROD LIVE BRL 1.00 payment release gate. Not a public payment API.';
