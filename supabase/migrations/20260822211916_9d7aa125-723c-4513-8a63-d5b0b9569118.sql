-- COBS OS · MP-01 — Canonical financial foundation.
create type public.payment_order_status as enum (
  'open','partially_paid','paid','overdue','cancelled','refunded');

create type public.payment_event_type as enum (
  'PAYMENT_ORDER_CREATED',
  'PAYMENT_ATTEMPT_CREATED',
  'PAYMENT_PENDING',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'PAYMENT_CANCELLED',
  'PAYMENT_EXPIRED',
  'PAYMENT_REFUND_REQUESTED',
  'PAYMENT_REFUNDED');

create table public.payment_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  environment text not null,
  display_name text,
  is_active boolean not null default true,
  public_key_reference text,
  secret_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_provider_accounts_id_tenant_key unique (id, tenant_id),
  constraint payment_provider_accounts_provider_ck check (provider in ('mercadopago')),
  constraint payment_provider_accounts_env_ck check (environment in ('sandbox','live')),
  constraint payment_provider_accounts_secret_ref_ck
    check (secret_reference is null or secret_reference ~ '^[A-Z0-9_]{3,80}$'),
  constraint payment_provider_accounts_public_ref_ck
    check (public_key_reference is null or public_key_reference ~ '^[A-Z0-9_]{3,80}$')
);
create unique index payment_provider_accounts_scope_key
  on public.payment_provider_accounts (tenant_id, provider, environment);

grant select on public.payment_provider_accounts to authenticated;
grant all on public.payment_provider_accounts to service_role;
alter table public.payment_provider_accounts enable row level security;
create policy "Finance roles read provider accounts" on public.payment_provider_accounts
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid,
  person_id uuid,
  participation_id uuid,
  order_code text not null,
  description text not null,
  currency text not null default 'BRL',
  amount_total numeric(14,2) not null,
  due_at timestamptz,
  status public.payment_order_status not null default 'open',
  cancelled_at timestamptz,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_orders_id_tenant_key unique (id, tenant_id),
  constraint payment_orders_amount_positive check (amount_total > 0),
  constraint payment_orders_currency_ck check (currency = 'BRL'),
  constraint payment_orders_code_present check (nullif(btrim(order_code),'') is not null),
  constraint payment_orders_description_present check (nullif(btrim(description),'') is not null),
  constraint payment_orders_operation_fk
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id),
  constraint payment_orders_participation_fk
    foreign key (participation_id, tenant_id)
    references public.operation_participations(id, tenant_id),
  constraint payment_orders_person_fk foreign key (person_id) references public.people(id)
);
create unique index payment_orders_code_key on public.payment_orders (tenant_id, order_code);
create index payment_orders_operation_idx on public.payment_orders (operation_id, created_at desc);
create index payment_orders_person_idx on public.payment_orders (person_id, created_at desc);

grant select on public.payment_orders to authenticated;
grant all on public.payment_orders to service_role;
alter table public.payment_orders enable row level security;

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_order_id uuid not null,
  provider text not null,
  provider_account_id uuid not null,
  payment_method text not null,
  amount numeric(14,2) not null,
  currency text not null,
  provider_order_id text,
  provider_payment_id text,
  provider_status text,
  provider_status_detail text,
  external_reference text not null,
  idempotency_key text not null,
  expires_at timestamptz,
  pix_qr_code text,
  pix_ticket_url text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempts_id_tenant_key unique (id, tenant_id),
  constraint payment_attempts_amount_positive check (amount > 0),
  constraint payment_attempts_currency_ck check (currency = 'BRL'),
  constraint payment_attempts_method_ck check (payment_method in ('pix','credit_card','boleto')),
  constraint payment_attempts_order_fk
    foreign key (payment_order_id, tenant_id) references public.payment_orders(id, tenant_id),
  constraint payment_attempts_account_fk
    foreign key (provider_account_id, tenant_id)
    references public.payment_provider_accounts(id, tenant_id),
  constraint payment_attempts_external_reference_ck
    check (external_reference ~ '^cobs:[0-9a-f-]{36}$')
);
create unique index payment_attempts_idempotency_key
  on public.payment_attempts (tenant_id, idempotency_key);
create unique index payment_attempts_external_reference_key
  on public.payment_attempts (external_reference);
create unique index payment_attempts_provider_payment_key
  on public.payment_attempts (provider, provider_payment_id)
  where provider_payment_id is not null;
create index payment_attempts_order_idx on public.payment_attempts (payment_order_id, created_at desc);

grant select on public.payment_attempts to authenticated;
grant all on public.payment_attempts to service_role;
alter table public.payment_attempts enable row level security;

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_order_id uuid not null,
  payment_attempt_id uuid,
  event_type public.payment_event_type not null,
  amount numeric(14,2),
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  provider text,
  provider_event_id text,
  actor_profile_id uuid references public.profiles(id),
  reason text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  constraint payment_events_order_fk
    foreign key (payment_order_id, tenant_id) references public.payment_orders(id, tenant_id),
  constraint payment_events_attempt_fk
    foreign key (payment_attempt_id, tenant_id)
    references public.payment_attempts(id, tenant_id),
  constraint payment_events_amount_ck check (amount is null or amount > 0)
);
create unique index payment_events_provider_event_key
  on public.payment_events (provider, provider_event_id)
  where provider_event_id is not null;
create index payment_events_order_idx
  on public.payment_events (payment_order_id, recorded_at desc);

grant select on public.payment_events to authenticated;
grant all on public.payment_events to service_role;
alter table public.payment_events enable row level security;

create or replace function app_private.mp_control_active()
returns boolean language sql stable set search_path = 'pg_catalog','public' as $$
  select coalesce(current_setting('app.mp_control', true), 'off') = 'on'
$$;

create or replace function public.guard_mp_mutation()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  if app_private.mp_control_active() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Financial data can only change through the approved payment commands';
end;
$$;

create or replace function public.guard_mp_append_only()
returns trigger language plpgsql set search_path = 'pg_catalog','public' as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger payment_provider_accounts_guard
  before insert or update or delete on public.payment_provider_accounts
  for each row execute function public.guard_mp_mutation();
create trigger payment_provider_accounts_updated_at
  before update on public.payment_provider_accounts
  for each row execute function public.set_updated_at();

create trigger payment_orders_guard
  before insert or update or delete on public.payment_orders
  for each row execute function public.guard_mp_mutation();
create trigger payment_orders_updated_at
  before update on public.payment_orders
  for each row execute function public.set_updated_at();

create trigger payment_attempts_guard
  before insert or update or delete on public.payment_attempts
  for each row execute function public.guard_mp_mutation();
create trigger payment_attempts_updated_at
  before update on public.payment_attempts
  for each row execute function public.set_updated_at();

create trigger payment_events_guard
  before insert on public.payment_events
  for each row execute function public.guard_mp_mutation();
create trigger payment_events_append_only
  before update or delete on public.payment_events
  for each row execute function public.guard_mp_append_only();

create or replace function app_private.mp_is_payer(_tenant_id uuid, _person_id uuid)
returns boolean language sql stable security definer
set search_path = 'pg_catalog','public' as $$
  select _person_id is not null and exists (
    select 1 from public.people p
    where p.id = _person_id
      and p.tenant_id = _tenant_id
      and p.profile_id = auth.uid()
  )
$$;

create or replace function app_private.mp_can_read_order(_tenant_id uuid, _person_id uuid)
returns boolean language sql stable security definer
set search_path = 'pg_catalog','public' as $$
  select app_private.has_tenant_role(
           _tenant_id, array['owner','admin','operations_agent']::public.app_role[])
      or app_private.mp_is_payer(_tenant_id, _person_id)
$$;

create policy "Authorized readers see payment orders" on public.payment_orders
  for select to authenticated
  using (app_private.mp_can_read_order(tenant_id, person_id));

create policy "Attempts follow their payment order" on public.payment_attempts
  for select to authenticated
  using (exists (
    select 1 from public.payment_orders o
    where o.id = payment_attempts.payment_order_id
      and o.tenant_id = payment_attempts.tenant_id
      and app_private.mp_can_read_order(o.tenant_id, o.person_id)));

create policy "Finance roles read payment events" on public.payment_events
  for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));

create or replace function app_private.mp_order_totals(_order public.payment_orders)
returns jsonb language sql stable security definer
set search_path = 'pg_catalog','public' as $$
  with sums as (
    select
      coalesce(sum(e.amount) filter (where e.event_type = 'PAYMENT_APPROVED'), 0) as approved,
      coalesce(sum(e.amount) filter (where e.event_type = 'PAYMENT_REFUNDED'), 0) as refunded
    from public.payment_events e
    where e.payment_order_id = _order.id
  )
  select jsonb_build_object(
    'approved_total', s.approved,
    'refunded_total', s.refunded,
    'net_paid', s.approved - s.refunded,
    'outstanding', greatest(_order.amount_total - (s.approved - s.refunded), 0))
  from sums s
$$;

create or replace function app_private.mp_derive_status(_order public.payment_orders)
returns public.payment_order_status language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare
  _t jsonb := app_private.mp_order_totals(_order);
  _approved numeric := (_t->>'approved_total')::numeric;
  _refunded numeric := (_t->>'refunded_total')::numeric;
  _net numeric := (_t->>'net_paid')::numeric;
begin
  if _approved > 0 and _refunded >= _approved then return 'refunded'; end if;
  if _order.cancelled_at is not null then return 'cancelled'; end if;
  if _net >= _order.amount_total then return 'paid'; end if;
  if _net > 0 then return 'partially_paid'; end if;
  if _order.due_at is not null and _order.due_at < now() then return 'overdue'; end if;
  return 'open';
end;
$$;

create or replace function app_private.mp_sync_status(_order_id uuid)
returns public.payment_order_status language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare
  _order public.payment_orders;
  _status public.payment_order_status;
begin
  select * into _order from public.payment_orders o where o.id = _order_id for update;
  _status := app_private.mp_derive_status(_order);
  if _status is distinct from _order.status then
    perform set_config('app.mp_control','on', true);
    update public.payment_orders set status = _status where id = _order_id;
    perform set_config('app.mp_control','off', true);
  end if;
  return _status;
end;
$$;

create or replace function app_private.mp_order_for(_order_id uuid, _roles text[])
returns public.payment_orders language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare _order public.payment_orders;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _order from public.payment_orders o where o.id = _order_id;
  if _order.id is null then raise exception 'Payment order not found'; end if;
  if not app_private.has_tenant_role(_order.tenant_id, _roles::public.app_role[]) then
    raise exception 'You do not have permission for this payment order';
  end if;
  return _order;
end;
$$;

create or replace function public.upsert_payment_provider_account(
  _tenant_id uuid,
  _provider text,
  _environment text,
  _display_name text default null,
  _public_key_reference text default null,
  _secret_reference text default null,
  _is_active boolean default true)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare _row public.payment_provider_accounts;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins manage payment provider accounts';
  end if;

  perform set_config('app.mp_control','on', true);
  insert into public.payment_provider_accounts (
    tenant_id, provider, environment, display_name,
    public_key_reference, secret_reference, is_active)
  values (_tenant_id, _provider, _environment, nullif(btrim(coalesce(_display_name,'')),''),
          nullif(btrim(coalesce(_public_key_reference,'')),''),
          nullif(btrim(coalesce(_secret_reference,'')),''),
          coalesce(_is_active, true))
  on conflict (tenant_id, provider, environment) do update
    set display_name = excluded.display_name,
        public_key_reference = excluded.public_key_reference,
        secret_reference = excluded.secret_reference,
        is_active = excluded.is_active
  returning * into _row;
  perform set_config('app.mp_control','off', true);

  return jsonb_build_object(
    'provider_account_id', _row.id,
    'provider', _row.provider,
    'environment', _row.environment,
    'is_active', _row.is_active,
    'secret_configured', _row.secret_reference is not null);
end;
$$;

create or replace function public.create_payment_order(
  _tenant_id uuid,
  _description text,
  _amount_total numeric,
  _idempotency_key text,
  _operation_id uuid default null,
  _person_id uuid default null,
  _participation_id uuid default null,
  _due_at timestamptz default null,
  _order_code text default null,
  _metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare
  _row public.payment_orders;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _existing jsonb;
  _code text := nullif(btrim(coalesce(_order_code,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins create payment orders';
  end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _amount_total is null or _amount_total <= 0 then
    raise exception 'A payment order needs a positive amount';
  end if;
  if nullif(btrim(coalesce(_description,'')),'') is null then
    raise exception 'A payment order needs a description';
  end if;

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = auth.uid()
      and k.action = 'finance.payment_order_create'
      and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  if _operation_id is not null and not exists (
    select 1 from public.operations o where o.id = _operation_id and o.tenant_id = _tenant_id)
  then raise exception 'Operation does not belong to this tenant'; end if;
  if _person_id is not null and not exists (
    select 1 from public.people p where p.id = _person_id and p.tenant_id = _tenant_id)
  then raise exception 'Person does not belong to this tenant'; end if;
  if _participation_id is not null and not exists (
    select 1 from public.operation_participations pa
     where pa.id = _participation_id and pa.tenant_id = _tenant_id
       and (_operation_id is null or pa.operation_id = _operation_id))
  then raise exception 'Participation does not belong to this tenant or operation'; end if;

  perform set_config('app.mp_control','on', true);
  insert into public.payment_orders (
    tenant_id, operation_id, person_id, participation_id, order_code, description,
    amount_total, due_at, metadata, created_by)
  values (_tenant_id, _operation_id, _person_id, _participation_id,
          coalesce(_code, 'PO-' || upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 10))),
          btrim(_description), round(_amount_total, 2), _due_at,
          coalesce(_metadata, '{}'::jsonb), auth.uid())
  returning * into _row;

  insert into public.payment_events (
    tenant_id, payment_order_id, event_type, actor_profile_id, payload, idempotency_key)
  values (_tenant_id, _row.id, 'PAYMENT_ORDER_CREATED', auth.uid(),
          jsonb_build_object('amount_total', _row.amount_total, 'currency', _row.currency), _key);
  perform set_config('app.mp_control','off', true);

  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'finance.payment_order_created',
    'payment_order', _row.id, _key,
    jsonb_build_object('amount_total', _row.amount_total, 'currency', _row.currency,
                       'operation_id', _row.operation_id));

  _existing := jsonb_build_object(
    'payment_order_id', _row.id, 'order_code', _row.order_code, 'status', _row.status);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_tenant_id, auth.uid(), 'finance.payment_order_create', _key, _existing);
  return _existing;
end;
$$;

create or replace function public.cancel_payment_order(
  _payment_order_id uuid,
  _reason text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare
  _order public.payment_orders;
  _reason_text text := nullif(btrim(coalesce(_reason,'')),'');
begin
  _order := app_private.mp_order_for(_payment_order_id, array['owner','admin']);
  if _reason_text is null then raise exception 'A cancellation reason is required'; end if;
  perform app_private.assert_generic_note(_reason_text);
  if _order.cancelled_at is not null then
    return jsonb_build_object('payment_order_id', _order.id, 'status', _order.status);
  end if;
  if _order.status in ('paid','refunded') then
    raise exception 'A % payment order cannot be cancelled', _order.status;
  end if;

  perform set_config('app.mp_control','on', true);
  update public.payment_orders
     set cancelled_at = now(), cancellation_reason = _reason_text
   where id = _order.id;
  insert into public.payment_events (
    tenant_id, payment_order_id, event_type, actor_profile_id, reason)
  values (_order.tenant_id, _order.id, 'PAYMENT_CANCELLED', auth.uid(), _reason_text);
  perform set_config('app.mp_control','off', true);

  perform app_private.record_audit_event(_order.tenant_id, auth.uid(), 'finance.payment_cancelled',
    'payment_order', _order.id, null, jsonb_build_object('reason', _reason_text));

  return jsonb_build_object(
    'payment_order_id', _order.id, 'status', app_private.mp_sync_status(_order.id));
end;
$$;

create or replace function public.create_payment_attempt(
  _payment_order_id uuid,
  _payment_method text,
  _idempotency_key text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare
  _order public.payment_orders;
  _account public.payment_provider_accounts;
  _row public.payment_attempts;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _status public.payment_order_status;
  _id uuid := gen_random_uuid();
  _outstanding numeric;
begin
  _order := app_private.mp_order_for(
    _payment_order_id, array['owner','admin','operations_agent']);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _payment_method is null or _payment_method not in ('pix','credit_card','boleto') then
    raise exception 'Unsupported payment method';
  end if;

  select * into _row from public.payment_attempts a
   where a.tenant_id = _order.tenant_id and a.idempotency_key = _key;
  if _row.id is not null then
    if _row.payment_order_id is distinct from _order.id then
      raise exception 'Idempotency key already used for another payment order';
    end if;
    return jsonb_build_object(
      'payment_attempt_id', _row.id, 'external_reference', _row.external_reference,
      'amount', _row.amount, 'currency', _row.currency,
      'payment_method', _row.payment_method, 'idempotent_replay', true);
  end if;

  _status := app_private.mp_sync_status(_order.id);
  if _status not in ('open','partially_paid','overdue') then
    raise exception 'A % payment order no longer accepts payment attempts', _status;
  end if;

  _outstanding := (app_private.mp_order_totals(_order)->>'outstanding')::numeric;
  if _outstanding <= 0 then raise exception 'This payment order has nothing outstanding'; end if;

  select * into _account from public.payment_provider_accounts pa
   where pa.tenant_id = _order.tenant_id and pa.provider = 'mercadopago' and pa.is_active
   order by (pa.environment = 'sandbox') desc limit 1;
  if _account.id is null then
    raise exception 'No active payment provider account is configured for this tenant';
  end if;

  perform set_config('app.mp_control','on', true);
  insert into public.payment_attempts (
    id, tenant_id, payment_order_id, provider, provider_account_id, payment_method,
    amount, currency, external_reference, idempotency_key, created_by)
  values (_id, _order.tenant_id, _order.id, _account.provider, _account.id, _payment_method,
          _outstanding, _order.currency, 'cobs:' || _id::text, _key, auth.uid())
  returning * into _row;

  insert into public.payment_events (
    tenant_id, payment_order_id, payment_attempt_id, event_type, amount,
    actor_profile_id, provider, payload, idempotency_key)
  values (_order.tenant_id, _order.id, _row.id, 'PAYMENT_ATTEMPT_CREATED', _row.amount,
          auth.uid(), _account.provider,
          jsonb_build_object('payment_method', _payment_method,
                             'external_reference', _row.external_reference), _key);
  perform set_config('app.mp_control','off', true);

  perform app_private.record_audit_event(_order.tenant_id, auth.uid(),
    'finance.payment_attempt_created', 'payment_attempt', _row.id, _key,
    jsonb_build_object('payment_order_id', _order.id, 'amount', _row.amount,
                       'payment_method', _payment_method));

  return jsonb_build_object(
    'payment_attempt_id', _row.id, 'external_reference', _row.external_reference,
    'amount', _row.amount, 'currency', _row.currency,
    'payment_method', _row.payment_method, 'provider', _row.provider,
    'provider_account_id', _account.id, 'environment', _account.environment,
    'secret_reference', _account.secret_reference, 'idempotent_replay', false);
end;
$$;

create or replace function public.get_payment_order_summary(_payment_order_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog','public' as $$
declare
  _order public.payment_orders;
  _totals jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _order from public.payment_orders o where o.id = _payment_order_id;
  if _order.id is null then raise exception 'Payment order not found'; end if;
  if not app_private.mp_can_read_order(_order.tenant_id, _order.person_id) then
    raise exception 'You do not have permission for this payment order';
  end if;
  _totals := app_private.mp_order_totals(_order);

  return jsonb_build_object(
    'payment_order_id', _order.id,
    'order_code', _order.order_code,
    'description', _order.description,
    'currency', _order.currency,
    'amount_total', _order.amount_total,
    'due_at', _order.due_at,
    'status', app_private.mp_derive_status(_order),
    'totals', _totals,
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'payment_attempt_id', a.id, 'payment_method', a.payment_method,
        'amount', a.amount, 'provider', a.provider,
        'provider_status', a.provider_status, 'provider_status_detail', a.provider_status_detail,
        'external_reference', a.external_reference, 'expires_at', a.expires_at,
        'pix_ticket_url', a.pix_ticket_url, 'created_at', a.created_at)
        order by a.created_at desc)
      from public.payment_attempts a where a.payment_order_id = _order.id), '[]'::jsonb),
    'events', case
      when app_private.has_tenant_role(_order.tenant_id, array['owner','admin']::public.app_role[])
      then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id, 'event_type', e.event_type, 'amount', e.amount,
          'occurred_at', e.occurred_at, 'provider', e.provider, 'reason', e.reason)
          order by e.recorded_at desc)
        from public.payment_events e where e.payment_order_id = _order.id), '[]'::jsonb)
      else '[]'::jsonb end);
end;
$$;

create or replace function public.record_provider_payment_event(
  _provider text,
  _event_type public.payment_event_type,
  _external_reference text default null,
  _provider_payment_id text default null,
  _provider_event_id text default null,
  _provider_status text default null,
  _provider_status_detail text default null,
  _amount numeric default null,
  _occurred_at timestamptz default null,
  _payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare
  _attempt public.payment_attempts;
  _order public.payment_orders;
  _event_id uuid;
begin
  if _provider is null then raise exception 'Provider is required'; end if;

  if _provider_event_id is not null and exists (
    select 1 from public.payment_events e
     where e.provider = _provider and e.provider_event_id = _provider_event_id)
  then
    return jsonb_build_object('duplicate', true, 'recorded', false);
  end if;

  select * into _attempt from public.payment_attempts a
   where (_external_reference is not null and a.external_reference = _external_reference)
      or (_provider_payment_id is not null and a.provider = _provider
          and a.provider_payment_id = _provider_payment_id)
   limit 1;
  if _attempt.id is null then
    return jsonb_build_object('duplicate', false, 'recorded', false, 'reason', 'unmatched');
  end if;

  select * into _order from public.payment_orders o where o.id = _attempt.payment_order_id;

  perform set_config('app.mp_control','on', true);
  update public.payment_attempts
     set provider_payment_id = coalesce(_provider_payment_id, provider_payment_id),
         provider_status = coalesce(_provider_status, provider_status),
         provider_status_detail = coalesce(_provider_status_detail, provider_status_detail)
   where id = _attempt.id;

  insert into public.payment_events (
    tenant_id, payment_order_id, payment_attempt_id, event_type, amount,
    occurred_at, provider, provider_event_id, payload)
  values (_attempt.tenant_id, _order.id, _attempt.id, _event_type,
          case when _event_type in ('PAYMENT_APPROVED','PAYMENT_REFUNDED')
               then coalesce(_amount, _attempt.amount) else null end,
          coalesce(_occurred_at, now()), _provider, _provider_event_id,
          coalesce(_payload, '{}'::jsonb))
  returning id into _event_id;
  perform set_config('app.mp_control','off', true);

  perform app_private.record_audit_event(_attempt.tenant_id, null,
    'finance.payment_provider_event_recorded', 'payment_event', _event_id, _provider_event_id,
    jsonb_build_object('event_type', _event_type, 'provider', _provider,
                       'payment_order_id', _order.id, 'payment_attempt_id', _attempt.id));

  return jsonb_build_object(
    'duplicate', false, 'recorded', true, 'payment_event_id', _event_id,
    'payment_order_id', _order.id, 'payment_attempt_id', _attempt.id,
    'status', app_private.mp_sync_status(_order.id));
end;
$$;

revoke all on function app_private.mp_is_payer(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.mp_order_for(uuid, text[]) from public, anon, authenticated;
revoke all on function app_private.mp_order_totals(public.payment_orders) from public, anon, authenticated;
revoke all on function app_private.mp_derive_status(public.payment_orders) from public, anon, authenticated;
revoke all on function app_private.mp_sync_status(uuid) from public, anon, authenticated;

revoke all on function public.create_payment_order(uuid, text, numeric, text, uuid, uuid, uuid, timestamptz, text, jsonb) from public, anon;
revoke all on function public.cancel_payment_order(uuid, text) from public, anon;
revoke all on function public.create_payment_attempt(uuid, text, text) from public, anon;
revoke all on function public.get_payment_order_summary(uuid) from public, anon;
revoke all on function public.upsert_payment_provider_account(uuid, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.record_provider_payment_event(text, public.payment_event_type, text, text, text, text, text, numeric, timestamptz, jsonb) from public, anon, authenticated;

grant execute on function public.create_payment_order(uuid, text, numeric, text, uuid, uuid, uuid, timestamptz, text, jsonb) to authenticated;
grant execute on function public.cancel_payment_order(uuid, text) to authenticated;
grant execute on function public.create_payment_attempt(uuid, text, text) to authenticated;
grant execute on function public.get_payment_order_summary(uuid) to authenticated;
grant execute on function public.upsert_payment_provider_account(uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.record_provider_payment_event(text, public.payment_event_type, text, text, text, text, text, numeric, timestamptz, jsonb) to service_role;