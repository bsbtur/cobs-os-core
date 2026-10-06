-- Team Seffrin: automatic three-lot commercial ladder.
-- Lot 1: 5 x R$ 9.997
-- Lot 2: 5 x R$ 10.297
-- Lot 3: 10 x R$ 10.497
-- Selection is serialized per operation and based on live reserved + confirmed capacity.

create table if not exists public.operation_commercial_lots (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lot_number integer not null check (lot_number > 0),
  label text not null,
  offering_id uuid not null references public.offerings(id),
  capacity integer not null check (capacity > 0),
  unit_amount_minor bigint not null check (unit_amount_minor >= 0),
  entry_minor bigint not null check (entry_minor >= 0),
  balance_minor bigint not null check (balance_minor >= 0),
  balance_card_installments_max integer not null default 12 check (balance_card_installments_max between 1 and 24),
  card_installment_fees_paid_by_customer boolean not null default true,
  status text not null default 'active' check (status in ('active','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(operation_id,lot_number),
  unique(operation_id,offering_id)
);

alter table public.operation_commercial_lots enable row level security;
revoke all on public.operation_commercial_lots from public,anon,authenticated;
grant all on public.operation_commercial_lots to service_role;

create index if not exists operation_commercial_lots_operation_idx
  on public.operation_commercial_lots(operation_id,lot_number);

create or replace function app_private.resolve_operation_commercial_lot(_operation_id uuid)
returns public.operation_commercial_lots
language plpgsql
security definer
set search_path to 'pg_catalog','public','app_private'
as $function$
declare
  _lot public.operation_commercial_lots;
  _candidate public.operation_commercial_lots;
  _used bigint;
begin
  -- Serialize lot selection so the sixth concurrent buyer cannot also receive lot 1.
  perform pg_advisory_xact_lock(hashtextextended(_operation_id::text,0));

  for _candidate in
    select l.*
    from public.operation_commercial_lots l
    where l.operation_id=_operation_id
      and l.status='active'
    order by l.lot_number
  loop
    perform app_private.w09_lock_offering_capacity(_candidate.offering_id);
    perform app_private.w09_materialize_expired_reservations(_candidate.offering_id);

    select coalesce(sum(r.quantity),0)
      into _used
    from public.commercial_reservations r
    where r.offering_id=_candidate.offering_id
      and (
        r.status='confirmed'
        or (r.status='reserved' and r.expires_at>now())
      );

    if _used < _candidate.capacity then
      _lot:=_candidate;
      return _lot;
    end if;
  end loop;

  raise exception 'All commercial lots are sold out';
end;
$function$;

revoke all on function app_private.resolve_operation_commercial_lot(uuid) from public,anon,authenticated;
grant execute on function app_private.resolve_operation_commercial_lot(uuid) to service_role;

create or replace function public.get_operation_commercial_lot_status(_operation_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','app_private'
as $function$
declare
  _op public.operations;
  _row record;
  _lots jsonb := '[]'::jsonb;
  _current integer := null;
  _remaining_total integer := 0;
begin
  select * into _op
  from public.operations
  where code=btrim(_operation_code)
    and archived_at is null
  limit 1;
  if _op.id is null then raise exception 'Operation not found'; end if;

  for _row in
    select
      l.lot_number,
      l.label,
      l.capacity,
      l.unit_amount_minor,
      l.entry_minor,
      l.balance_minor,
      l.balance_card_installments_max,
      l.card_installment_fees_paid_by_customer,
      coalesce(sum(r.quantity) filter (
        where r.status='confirmed'
           or (r.status='reserved' and r.expires_at>now())
      ),0)::integer as used
    from public.operation_commercial_lots l
    left join public.commercial_reservations r on r.offering_id=l.offering_id
    where l.operation_id=_op.id
      and l.status='active'
    group by l.id
    order by l.lot_number
  loop
    if _current is null and _row.used < _row.capacity then
      _current:=_row.lot_number;
    end if;
    _remaining_total:=_remaining_total+greatest(_row.capacity-_row.used,0);
    _lots:=_lots||jsonb_build_array(jsonb_build_object(
      'lot_number',_row.lot_number,
      'label',_row.label,
      'capacity',_row.capacity,
      'used',_row.used,
      'remaining',greatest(_row.capacity-_row.used,0),
      'unit_amount_minor',_row.unit_amount_minor,
      'entry_minor',_row.entry_minor,
      'balance_minor',_row.balance_minor,
      'balance_card_installments_max',_row.balance_card_installments_max,
      'card_installment_fees_paid_by_customer',_row.card_installment_fees_paid_by_customer,
      'state',case
        when _row.used>=_row.capacity then 'sold_out'
        when _current=_row.lot_number then 'current'
        else 'upcoming'
      end
    ));
  end loop;

  return jsonb_build_object(
    'operation_id',_op.id,
    'current_lot',_current,
    'sold_out',_current is null,
    'remaining_total',_remaining_total,
    'lots',_lots
  );
end;
$function$;

revoke all on function public.get_operation_commercial_lot_status(text) from public,anon,authenticated;
grant execute on function public.get_operation_commercial_lot_status(text) to service_role;

create or replace function public.create_public_checkout_order_v2(
  _operation_code text,
  _full_name text,
  _email text,
  _phone_e164 text,
  _checkout_token_hash text,
  _idempotency_key text,
  _allow_closed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','app_private'
as $function$
declare
  _op public.operations;
  _cfg public.operation_commercial_configs;
  _lot public.operation_commercial_lots;
  _off public.offerings;
  _person_id uuid;
  _sell public.sellables;
  _price public.prices;
  _order_id uuid;
  _item public.order_items;
  _totals jsonb;
  _existing public.orders;
  _session_id uuid;
  _order_metadata jsonb;
begin
  if nullif(btrim(coalesce(_operation_code,'')),'') is null then raise exception 'Operation code is required'; end if;
  if nullif(btrim(coalesce(_full_name,'')),'') is null then raise exception 'Full name is required'; end if;
  if nullif(btrim(coalesce(_email,'')),'') is null then raise exception 'Email is required'; end if;
  if nullif(btrim(coalesce(_checkout_token_hash,'')),'') is null or length(_checkout_token_hash)<>64 then raise exception 'Invalid checkout token hash'; end if;
  if nullif(btrim(coalesce(_idempotency_key,'')),'') is null then raise exception 'Idempotency key is required'; end if;

  select * into _op from public.operations
  where code=btrim(_operation_code) and archived_at is null limit 1;
  if _op.id is null then raise exception 'Checkout operation not found'; end if;
  if _op.status in ('completed','cancelled') then raise exception 'Checkout operation is closed'; end if;

  select * into _cfg from public.operation_commercial_configs
  where operation_id=_op.id and tenant_id=_op.tenant_id and status='active';
  if _cfg.operation_id is null then raise exception 'Checkout operation is not commercially configured'; end if;
  if not _allow_closed and _cfg.sales_public is not true then raise exception 'Public sales are not open'; end if;

  select * into _existing from public.orders
  where tenant_id=_op.tenant_id
    and metadata->>'public_checkout_idempotency_key'=btrim(_idempotency_key)
  order by created_at desc limit 1;

  if _existing.id is not null then
    select id into _session_id from public.public_checkout_sessions where order_id=_existing.id limit 1;
    return jsonb_build_object(
      'order_id',_existing.id,
      'status',_existing.status,
      'session_id',_session_id,
      'reused',true,
      'total_minor',_existing.grand_total_minor,
      'lot_number',coalesce((_existing.metadata->>'commercial_lot_number')::integer,1),
      'lot_label',_existing.metadata->>'commercial_lot_label',
      'entry_minor',coalesce((_existing.metadata->>'entry_minor')::bigint,_cfg.entry_minor),
      'balance_minor',coalesce((_existing.metadata->>'balance_minor')::bigint,_cfg.balance_minor),
      'commercial_terms_version',_cfg.commercial_terms_version,
      'cancellation_policy_version',_cfg.cancellation_policy_version
    );
  end if;

  _lot:=app_private.resolve_operation_commercial_lot(_op.id);

  select * into _off from public.offerings
  where id=_lot.offering_id and tenant_id=_op.tenant_id;
  if _off.id is null or _off.status<>'active' then raise exception 'Current lot offering is not active'; end if;

  select p.id into _person_id from public.people p
  where p.tenant_id=_op.tenant_id and lower(coalesce(p.email,''))=lower(btrim(_email))
  order by p.created_at asc limit 1;

  if _person_id is null then
    insert into public.people(tenant_id,full_name,email,phone_e164,preferred_locale)
    values(_op.tenant_id,btrim(_full_name),lower(btrim(_email)),nullif(btrim(coalesce(_phone_e164,'')),''),'pt-BR')
    returning id into _person_id;
  end if;

  select * into _sell from public.sellables
  where tenant_id=_op.tenant_id and offering_id=_off.id and status='active'
  order by created_at asc limit 1;
  if _sell.id is null then raise exception 'Active sellable not found for current lot'; end if;

  _price:=app_private.w09_resolve_active_price(_sell.id,'BRL');
  if _price.unit_amount_minor<>_lot.unit_amount_minor then
    raise exception 'Current lot price mismatch';
  end if;

  _order_metadata:=jsonb_build_object(
    'source','public_checkout_v2',
    'public_checkout_idempotency_key',btrim(_idempotency_key),
    'commercial_terms_version',_cfg.commercial_terms_version,
    'cancellation_policy_version',_cfg.cancellation_policy_version,
    'commercial_lot_number',_lot.lot_number,
    'commercial_lot_label',_lot.label,
    'entry_minor',_lot.entry_minor,
    'balance_minor',_lot.balance_minor,
    'balance_card_installments_max',_lot.balance_card_installments_max,
    'card_installment_fees_paid_by_customer',_lot.card_installment_fees_paid_by_customer
  );
  if _allow_closed then
    _order_metadata:=_order_metadata||jsonb_build_object(
      'qa_public_checkout',true,'qa_environment','test','qa_sales_public_bypass',true
    );
  end if;

  perform set_config('app.w09_control','on',true);
  insert into public.orders(
    tenant_id,operation_id,buyer_person_id,buyer_name_snapshot,currency,status,
    reference_label,metadata,created_by
  ) values (
    _op.tenant_id,_op.id,_person_id,btrim(_full_name),'BRL','draft',
    _off.name,_order_metadata,null
  ) returning id into _order_id;

  insert into public.order_items(
    tenant_id,order_id,sellable_id,price_id,offering_id,sellable_kind,
    sellable_name_snapshot,description_snapshot,price_basis,currency,
    unit_amount_minor,quantity,discount_minor,line_subtotal_minor,line_total_minor,
    beneficiary_person_id,created_by
  ) values (
    _op.tenant_id,_order_id,_sell.id,_price.id,_sell.offering_id,_sell.sellable_kind,
    _off.name,coalesce(_price.description,_sell.description),_price.price_basis,'BRL',
    _price.unit_amount_minor,1,0,_price.unit_amount_minor,_price.unit_amount_minor,
    _person_id,null
  ) returning * into _item;
  perform set_config('app.w09_control','off',true);

  _totals:=app_private.w09_compute_order_totals(_order_id);
  perform app_private.w09_reserve_or_reacquire(_item,'reserved');

  perform set_config('app.w09_control','on',true);
  update public.orders set
    status='submitted',
    submitted_at=now(),
    submitted_by=null,
    subtotal_minor=(_totals->>'subtotal_minor')::bigint,
    discount_total_minor=(_totals->>'discount_total_minor')::bigint,
    grand_total_minor=(_totals->>'grand_total_minor')::bigint
  where id=_order_id;
  perform set_config('app.w09_control','off',true);

  insert into public.public_checkout_sessions(tenant_id,order_id,token_hash,status,expires_at)
  values(_op.tenant_id,_order_id,btrim(_checkout_token_hash),'active',now()+interval '2 hours')
  returning id into _session_id;

  return jsonb_build_object(
    'order_id',_order_id,
    'status','submitted',
    'session_id',_session_id,
    'reused',false,
    'total_minor',(_totals->>'grand_total_minor')::bigint,
    'lot_number',_lot.lot_number,
    'lot_label',_lot.label,
    'entry_minor',_lot.entry_minor,
    'balance_minor',_lot.balance_minor,
    'balance_card_installments_max',_lot.balance_card_installments_max,
    'card_installment_fees_paid_by_customer',_lot.card_installment_fees_paid_by_customer,
    'commercial_terms_version',_cfg.commercial_terms_version,
    'cancellation_policy_version',_cfg.cancellation_policy_version
  );
end;
$function$;

revoke all on function public.create_public_checkout_order_v2(text,text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_public_checkout_order_v2(text,text,text,text,text,text,boolean) to service_role;

do $seed$
declare
  _tenant uuid:='bb25410b-4c7a-4d4c-965c-ee43d7084068';
  _operation uuid:='b207edae-7293-4d57-b994-5a442a1fad89';
  _experience uuid;
  _off1 uuid;
  _off2 uuid;
  _off3 uuid;
  _sell uuid;
begin
  select experience_id into _experience
  from public.offerings
  where tenant_id=_tenant and slug='team-seffrin-brasilia-2027-lote-fundadores'
  limit 1;
  if _experience is null then raise exception 'Team Seffrin commercial experience missing'; end if;

  select id into _off1 from public.offerings
  where tenant_id=_tenant and slug='team-seffrin-brasilia-2027-lote-fundadores';

  -- Normalize lot 1 catalog metadata/capacity.
  update public.offerings
  set capacity=5,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'lot_number',1,'lot_label','1º Lote — Fundadores','package_total_minor',999700,
        'entry_minor',199700,'balance_minor',800000
      )
  where id=_off1;

  select id into _off2 from public.offerings
  where tenant_id=_tenant and slug='team-seffrin-brasilia-2027-lote-2';
  if _off2 is null then
    insert into public.offerings(
      tenant_id,experience_id,name,slug,status,available_from,available_until,
      sales_start,sales_end,capacity,currency_code,metadata
    ) values (
      _tenant,_experience,'Team Seffrin Experience — Brasília 2027 · 2º Lote',
      'team-seffrin-brasilia-2027-lote-2','active',
      '2027-04-16T00:00:00-03:00','2027-04-22T23:59:59-03:00',
      now(),'2027-04-15T23:59:59-03:00',5,'BRL',
      jsonb_build_object('lot_number',2,'lot_label','2º Lote','package_total_minor',1029700,
        'entry_minor',199700,'balance_minor',830000,'sales_public',false)
    ) returning id into _off2;
  end if;

  select id into _off3 from public.offerings
  where tenant_id=_tenant and slug='team-seffrin-brasilia-2027-lote-final';
  if _off3 is null then
    insert into public.offerings(
      tenant_id,experience_id,name,slug,status,available_from,available_until,
      sales_start,sales_end,capacity,currency_code,metadata
    ) values (
      _tenant,_experience,'Team Seffrin Experience — Brasília 2027 · 3º Lote — Final',
      'team-seffrin-brasilia-2027-lote-final','active',
      '2027-04-16T00:00:00-03:00','2027-04-22T23:59:59-03:00',
      now(),'2027-04-15T23:59:59-03:00',10,'BRL',
      jsonb_build_object('lot_number',3,'lot_label','3º Lote — Final','package_total_minor',1049700,
        'entry_minor',199700,'balance_minor',850000,'sales_public',false)
    ) returning id into _off3;
  end if;

  -- Lot 2 sellable + price.
  select id into _sell from public.sellables
  where tenant_id=_tenant and offering_id=_off2 and status='active' limit 1;
  if _sell is null then
    perform set_config('app.w09_control','on',true);
    insert into public.sellables(tenant_id,sellable_kind,offering_id,name,description,status,metadata)
    values(_tenant,'offering',_off2,null,'Team Seffrin Experience — 2º lote','active',jsonb_build_object('lot',2,'lot_capacity',5))
    returning id into _sell;
    perform set_config('app.w09_control','off',true);
  end if;
  if not exists(select 1 from public.prices where sellable_id=_sell and status='active' and unit_amount_minor=1029700) then
    perform set_config('app.w09_control','on',true);
    insert into public.prices(tenant_id,sellable_id,currency,unit_amount_minor,price_basis,description,status,valid_from,valid_until,metadata)
    values(_tenant,_sell,'BRL',1029700,'per_person','2º Lote — R$ 10.297 por pessoa','active',now(),'2027-04-15T23:59:59-03:00',
      jsonb_build_object('entry_minor',199700,'balance_minor',830000,'balance_card_installments_max',12,'card_installment_fees_paid_by_customer',true));
    perform set_config('app.w09_control','off',true);
  end if;

  -- Lot 3 sellable + price.
  _sell:=null;
  select id into _sell from public.sellables
  where tenant_id=_tenant and offering_id=_off3 and status='active' limit 1;
  if _sell is null then
    perform set_config('app.w09_control','on',true);
    insert into public.sellables(tenant_id,sellable_kind,offering_id,name,description,status,metadata)
    values(_tenant,'offering',_off3,null,'Team Seffrin Experience — lote final','active',jsonb_build_object('lot',3,'lot_capacity',10))
    returning id into _sell;
    perform set_config('app.w09_control','off',true);
  end if;
  if not exists(select 1 from public.prices where sellable_id=_sell and status='active' and unit_amount_minor=1049700) then
    perform set_config('app.w09_control','on',true);
    insert into public.prices(tenant_id,sellable_id,currency,unit_amount_minor,price_basis,description,status,valid_from,valid_until,metadata)
    values(_tenant,_sell,'BRL',1049700,'per_person','3º Lote — Final — R$ 10.497 por pessoa','active',now(),'2027-04-15T23:59:59-03:00',
      jsonb_build_object('entry_minor',199700,'balance_minor',850000,'balance_card_installments_max',12,'card_installment_fees_paid_by_customer',true));
    perform set_config('app.w09_control','off',true);
  end if;

  insert into public.operation_commercial_lots(
    operation_id,tenant_id,lot_number,label,offering_id,capacity,unit_amount_minor,
    entry_minor,balance_minor,balance_card_installments_max,
    card_installment_fees_paid_by_customer,status,metadata
  ) values
    (_operation,_tenant,1,'1º Lote — Fundadores',_off1,5,999700,199700,800000,12,true,'active',jsonb_build_object('public_position','current')),
    (_operation,_tenant,2,'2º Lote',_off2,5,1029700,199700,830000,12,true,'active',jsonb_build_object('public_position','upcoming')),
    (_operation,_tenant,3,'3º Lote — Final',_off3,10,1049700,199700,850000,12,true,'active',jsonb_build_object('public_position','upcoming'))
  on conflict(operation_id,lot_number) do update set
    label=excluded.label,
    offering_id=excluded.offering_id,
    capacity=excluded.capacity,
    unit_amount_minor=excluded.unit_amount_minor,
    entry_minor=excluded.entry_minor,
    balance_minor=excluded.balance_minor,
    balance_card_installments_max=excluded.balance_card_installments_max,
    card_installment_fees_paid_by_customer=excluded.card_installment_fees_paid_by_customer,
    status='active',
    metadata=excluded.metadata,
    updated_at=now();
end
$seed$;
