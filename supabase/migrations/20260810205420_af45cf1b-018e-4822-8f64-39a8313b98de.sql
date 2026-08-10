-- =====================================================================
-- COBS OS · W09 COMMERCE & PAYMENTS CORE — FOUNDATION (additive)
-- =====================================================================
create extension if not exists btree_gist with schema extensions;

-- Additive tenant-safe identity key on W02 offerings (no semantic change)
create unique index if not exists offerings_tenant_identity_uq
  on public.offerings (tenant_id, id);

-- ================================================================= ENUMS (8)
create type public.sellable_kind as enum
  ('offering','merchandise','ticket','service','fee_item');

create type public.sellable_status as enum ('active','archived');

create type public.price_basis as enum ('per_person','per_unit','flat');

create type public.price_status as enum ('active','archived');

create type public.order_status as enum
  ('draft','submitted','confirmed','cancelled','completed');

create type public.commercial_reservation_status as enum
  ('reserved','confirmed','released','expired');

create type public.financial_fact_type as enum
  ('PAYMENT_RECORDED','PAYMENT_REVERSED','REFUND_RECORDED');

create type public.payment_method as enum ('cash','bank_transfer','other');

-- ============================================================== SELLABLES
create table public.sellables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sellable_kind public.sellable_kind not null,
  offering_id uuid,
  name text,
  description text,
  status public.sellable_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint sellables_offering_invariant_ck check (
    (sellable_kind = 'offering') = (offering_id is not null)),
  constraint sellables_name_ck check (
    (sellable_kind = 'offering' and name is null)
    or (sellable_kind <> 'offering'
        and char_length(btrim(coalesce(name,''))) between 2 and 160)),
  foreign key (tenant_id, offering_id)
    references public.offerings (tenant_id, id) on delete restrict
);
create unique index sellables_active_offering_uq
  on public.sellables (tenant_id, offering_id)
  where offering_id is not null and status = 'active';
create index sellables_tenant_idx on public.sellables (tenant_id, status, sellable_kind);

-- ================================================================= PRICES
create table public.prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sellable_id uuid not null,
  currency char(3) not null,
  unit_amount_minor bigint not null,
  price_basis public.price_basis not null default 'per_person',
  description text,
  status public.price_status not null default 'active',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint prices_currency_ck check (currency ~ '^[A-Z]{3}$'),
  constraint prices_amount_ck check (unit_amount_minor >= 0),
  constraint prices_window_ck check (valid_until is null or valid_until > valid_from),
  foreign key (tenant_id, sellable_id)
    references public.sellables (tenant_id, id) on delete cascade
);
create index prices_sellable_idx
  on public.prices (tenant_id, sellable_id, currency, status, valid_from);

alter table public.prices
  add constraint prices_active_window_excl
  exclude using gist (
    tenant_id with =,
    sellable_id with =,
    currency with =,
    tstzrange(valid_from, valid_until, '[)') with &&
  ) where (status = 'active');

-- ================================================================= ORDERS
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid,
  buyer_person_id uuid not null,
  buyer_name_snapshot text,
  currency char(3) not null,
  status public.order_status not null default 'draft',
  reference_label text,
  notes text,
  subtotal_minor bigint,
  discount_total_minor bigint,
  grand_total_minor bigint,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancellation_reason text,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint orders_currency_ck check (currency ~ '^[A-Z]{3}$'),
  constraint orders_totals_ck check (
    (subtotal_minor is null or subtotal_minor >= 0)
    and (discount_total_minor is null or discount_total_minor >= 0)
    and (grand_total_minor is null or grand_total_minor >= 0)),
  constraint orders_frozen_totals_ck check (
    status = 'draft' or grand_total_minor is not null),
  constraint orders_cancel_reason_ck check (
    status <> 'cancelled'
    or nullif(btrim(coalesce(cancellation_reason,'')),'') is not null),
  foreign key (tenant_id, operation_id)
    references public.operations (tenant_id, id) on delete restrict,
  foreign key (tenant_id, buyer_person_id)
    references public.people (tenant_id, id) on delete restrict
);
create index orders_tenant_status_idx on public.orders (tenant_id, status, created_at desc);
create index orders_operation_idx on public.orders (tenant_id, operation_id, created_at desc);
create index orders_buyer_idx on public.orders (tenant_id, buyer_person_id);

-- ============================================================ ORDER ITEMS
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null,
  sellable_id uuid not null,
  price_id uuid not null,
  offering_id uuid,
  sellable_kind public.sellable_kind not null,
  sellable_name_snapshot text not null,
  description_snapshot text,
  price_basis public.price_basis not null,
  currency char(3) not null,
  unit_amount_minor bigint not null,
  quantity integer not null default 1,
  discount_minor bigint not null default 0,
  line_subtotal_minor bigint not null,
  line_total_minor bigint not null,
  beneficiary_person_id uuid,
  snapshot_taken_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (order_id, id),
  constraint order_items_currency_ck check (currency ~ '^[A-Z]{3}$'),
  constraint order_items_quantity_ck check (quantity >= 1),
  constraint order_items_flat_quantity_ck check (price_basis <> 'flat' or quantity = 1),
  constraint order_items_unit_ck check (unit_amount_minor >= 0),
  constraint order_items_discount_ck check (
    discount_minor >= 0 and discount_minor <= line_subtotal_minor),
  constraint order_items_line_ck check (
    line_subtotal_minor >= 0 and line_total_minor >= 0
    and line_total_minor = line_subtotal_minor - discount_minor),
  constraint order_items_beneficiary_quantity_ck check (
    beneficiary_person_id is null or quantity = 1),
  constraint order_items_offering_ck check (
    (sellable_kind = 'offering') = (offering_id is not null)),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, sellable_id) references public.sellables (tenant_id, id) on delete restrict,
  foreign key (tenant_id, price_id) references public.prices (tenant_id, id) on delete restrict,
  foreign key (tenant_id, offering_id) references public.offerings (tenant_id, id) on delete restrict,
  foreign key (tenant_id, beneficiary_person_id) references public.people (tenant_id, id) on delete restrict
);
create index order_items_order_idx on public.order_items (tenant_id, order_id, created_at);
create index order_items_offering_idx on public.order_items (tenant_id, offering_id);

-- ================================================= COMMERCIAL RESERVATIONS
create table public.commercial_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null,
  order_item_id uuid not null,
  offering_id uuid not null,
  quantity integer not null,
  status public.commercial_reservation_status not null default 'reserved',
  expires_at timestamptz,
  confirmed_at timestamptz,
  released_at timestamptz,
  released_reason text,
  released_by uuid references public.profiles(id),
  expired_at timestamptz,
  reacquired_from_reservation_id uuid references public.commercial_reservations(id),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint commercial_reservations_quantity_ck check (quantity >= 1),
  constraint commercial_reservations_reserved_expiry_ck check (
    status <> 'reserved' or expires_at is not null),
  constraint commercial_reservations_release_evidence_ck check (
    status <> 'released'
    or (released_at is not null
        and released_by is not null
        and nullif(btrim(coalesce(released_reason,'')),'') is not null)),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, order_item_id) references public.order_items (tenant_id, id) on delete cascade,
  foreign key (order_id, order_item_id) references public.order_items (order_id, id) on delete cascade,
  foreign key (tenant_id, offering_id) references public.offerings (tenant_id, id) on delete restrict
);
create index commercial_reservations_offering_idx
  on public.commercial_reservations (tenant_id, offering_id, status);
create index commercial_reservations_order_idx
  on public.commercial_reservations (tenant_id, order_id, status);
create unique index commercial_reservations_active_item_uq
  on public.commercial_reservations (order_item_id)
  where status in ('reserved','confirmed');

-- =========================================================== FINANCIAL FACTS
create table public.financial_facts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null,
  fact_type public.financial_fact_type not null,
  amount_minor bigint not null,
  currency char(3) not null,
  method public.payment_method,
  reference text,
  reason text not null,
  references_fact_id uuid references public.financial_facts(id),
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  actor_profile_id uuid references public.profiles(id),
  correlation_id text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint financial_facts_amount_ck check (amount_minor > 0),
  constraint financial_facts_currency_ck check (currency ~ '^[A-Z]{3}$'),
  constraint financial_facts_reason_ck check (char_length(btrim(reason)) >= 3),
  constraint financial_facts_payment_shape_ck check (
    (fact_type = 'PAYMENT_RECORDED'
      and method is not null
      and nullif(btrim(coalesce(reference,'')),'') is not null
      and references_fact_id is null)
    or (fact_type in ('PAYMENT_REVERSED','REFUND_RECORDED')
      and method is null
      and nullif(btrim(coalesce(reference,'')),'') is not null
      and references_fact_id is not null)),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete restrict
);
create index financial_facts_order_idx
  on public.financial_facts (tenant_id, order_id, occurred_at desc);
create index financial_facts_lineage_idx
  on public.financial_facts (references_fact_id) where references_fact_id is not null;
create unique index financial_facts_reversal_singularity_uq
  on public.financial_facts (references_fact_id)
  where fact_type = 'PAYMENT_REVERSED';

-- ========================================================== GUARD TRIGGERS
create or replace function public.guard_w09_mutation()
returns trigger language plpgsql
set search_path to 'pg_catalog','public' as $$
begin
  if coalesce(current_setting('app.w09_control', true), 'off') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Commerce data can only change through the approved commands';
end; $$;

create or replace function public.guard_w09_append_only()
returns trigger language plpgsql
set search_path to 'pg_catalog','public' as $$
begin
  raise exception '% is append-only', tg_table_name;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['sellables','prices','orders','order_items',
                           'commercial_reservations'] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.guard_w09_mutation()',
      'guard_' || t || '_w09', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
      'set_' || t || '_updated_at', t);
  end loop;
end $$;

create trigger guard_financial_facts_insert
  before insert on public.financial_facts
  for each row execute function public.guard_w09_mutation();
create trigger guard_financial_facts_append_only
  before update or delete on public.financial_facts
  for each row execute function public.guard_w09_append_only();

-- ===================================================================== RLS
do $$
declare t text;
begin
  foreach t in array array['sellables','prices','orders','order_items',
                           'commercial_reservations','financial_facts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy "Commerce roles read %s" on public.%I for select to authenticated
         using (app_private.has_tenant_role(tenant_id,
                array[''owner'',''admin'',''operations_agent'']::public.app_role[]))', t, t);
    execute format('revoke all on public.%I from public', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

revoke all on function public.guard_w09_mutation() from public, anon, authenticated;
revoke all on function public.guard_w09_append_only() from public, anon, authenticated;

-- ================================================================ REALTIME
alter publication supabase_realtime add table public.financial_facts;
alter table public.financial_facts replica identity full;