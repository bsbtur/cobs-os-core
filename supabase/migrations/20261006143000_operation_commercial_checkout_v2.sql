create table if not exists public.operation_commercial_configs (
  operation_id uuid primary key references public.operations(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  offering_id uuid not null references public.offerings(id),
  status text not null default 'active' check (status in ('active','inactive')),
  sales_public boolean not null default false,
  commercial_terms_version text not null,
  cancellation_policy_version text not null,
  entry_minor bigint not null check (entry_minor >= 0),
  balance_minor bigint not null check (balance_minor >= 0),
  balance_card_installments_max integer not null default 1 check (balance_card_installments_max between 1 and 24),
  card_installment_fees_paid_by_customer boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, operation_id),
  unique (tenant_id, offering_id)
);

alter table public.operation_commercial_configs enable row level security;
revoke all on public.operation_commercial_configs from public, anon, authenticated;
grant all on public.operation_commercial_configs to service_role;

create index if not exists operation_commercial_configs_offering_idx
  on public.operation_commercial_configs(offering_id);

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
set search_path to 'pg_catalog','public'
as $function$
declare
  _op public.operations;
  _cfg public.operation_commercial_configs;
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
  if nullif(btrim(coalesce(_checkout_token_hash,'')),'') is null or length(_checkout_token_hash) <> 64 then raise exception 'Invalid checkout token hash'; end if;
  if nullif(btrim(coalesce(_idempotency_key,'')),'') is null then raise exception 'Idempotency key is required'; end if;

  select * into _op from public.operations o
  where o.code=btrim(_operation_code) and o.archived_at is null limit 1;
  if _op.id is null then raise exception 'Checkout operation not found'; end if;
  if _op.status in ('completed','cancelled') then raise exception 'Checkout operation is closed'; end if;

  select * into _cfg from public.operation_commercial_configs c
  where c.operation_id=_op.id and c.tenant_id=_op.tenant_id and c.status='active';
  if _cfg.operation_id is null then raise exception 'Checkout operation is not commercially configured'; end if;

  select * into _off from public.offerings o
  where o.id=_cfg.offering_id and o.tenant_id=_op.tenant_id;
  if _off.id is null or _off.status <> 'active' then raise exception 'Offering is not active'; end if;
  if not _allow_closed and _cfg.sales_public is not true then raise exception 'Public sales are not open'; end if;

  select * into _existing from public.orders o
  where o.tenant_id=_op.tenant_id
    and o.metadata->>'public_checkout_idempotency_key'=btrim(_idempotency_key)
  order by o.created_at desc limit 1;

  if _existing.id is not null then
    select s.id into _session_id from public.public_checkout_sessions s where s.order_id=_existing.id limit 1;
    return jsonb_build_object(
      'order_id',_existing.id,'status',_existing.status,'session_id',_session_id,
      'reused',true,'total_minor',_existing.grand_total_minor,'entry_minor',_cfg.entry_minor,
      'commercial_terms_version',_cfg.commercial_terms_version,
      'cancellation_policy_version',_cfg.cancellation_policy_version
    );
  end if;

  select p.id into _person_id from public.people p
  where p.tenant_id=_op.tenant_id and lower(coalesce(p.email,''))=lower(btrim(_email))
  order by p.created_at asc limit 1;

  if _person_id is null then
    insert into public.people(tenant_id,full_name,email,phone_e164,preferred_locale)
    values(_op.tenant_id,btrim(_full_name),lower(btrim(_email)),nullif(btrim(coalesce(_phone_e164,'')),''),'pt-BR')
    returning id into _person_id;
  end if;

  select * into _sell from public.sellables s
  where s.tenant_id=_op.tenant_id and s.offering_id=_off.id and s.status='active'
  order by s.created_at asc limit 1;
  if _sell.id is null then raise exception 'Active sellable not found'; end if;

  _price := app_private.w09_resolve_active_price(_sell.id,'BRL');

  _order_metadata := jsonb_build_object(
    'source','public_checkout_v2',
    'public_checkout_idempotency_key',btrim(_idempotency_key),
    'commercial_terms_version',_cfg.commercial_terms_version,
    'cancellation_policy_version',_cfg.cancellation_policy_version,
    'entry_minor',_cfg.entry_minor,
    'balance_minor',_cfg.balance_minor
  );
  if _allow_closed then
    _order_metadata := _order_metadata || jsonb_build_object(
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
  )
  returning id into _order_id;

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
  )
  returning * into _item;
  perform set_config('app.w09_control','off',true);

  _totals := app_private.w09_compute_order_totals(_order_id);
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
    'order_id',_order_id,'status','submitted','session_id',_session_id,'reused',false,
    'total_minor',(_totals->>'grand_total_minor')::bigint,'entry_minor',_cfg.entry_minor,
    'balance_minor',_cfg.balance_minor,'commercial_terms_version',_cfg.commercial_terms_version,
    'cancellation_policy_version',_cfg.cancellation_policy_version
  );
end;
$function$;

revoke all on function public.create_public_checkout_order_v2(text,text,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.create_public_checkout_order_v2(text,text,text,text,text,text,boolean) to service_role;

do $seed$
declare
  _tenant_id uuid := 'bb25410b-4c7a-4d4c-965c-ee43d7084068';
  _operation_id uuid := 'b207edae-7293-4d57-b994-5a442a1fad89';
  _experience_id uuid;
  _offering_id uuid;
  _sellable_id uuid;
begin
  if not exists (
    select 1 from public.operations
    where id=_operation_id and tenant_id=_tenant_id and code='TEAM-SEFFRIN-BSB-20270416'
  ) then return; end if;

  select id into _experience_id from public.experiences
  where tenant_id=_tenant_id and slug='team-seffrin-experience-brasilia-2027' limit 1;

  if _experience_id is null then
    insert into public.experiences(
      tenant_id,name,slug,short_description,description,experience_kind,category_tags,
      status,default_locale,default_timezone,country_code,region,city,metadata
    ) values (
      _tenant_id,'Team Seffrin Experience — Brasília 2027',
      'team-seffrin-experience-brasilia-2027',
      'Chapada dos Veadeiros + Brasília + Maratona Brasília 2027.',
      'Experiência de 7 dias / 6 noites para atletas, acompanhantes e famílias.',
      'hybrid',array['corrida','brasilia','chapada-dos-veadeiros','grupo'],'draft',
      'pt-BR','America/Sao_Paulo','BR','DF','Brasília',
      jsonb_build_object('source','team-seffrin-landing','commercial_stage','checkout_qa')
    ) returning id into _experience_id;
  end if;

  select id into _offering_id from public.offerings
  where tenant_id=_tenant_id and slug='team-seffrin-brasilia-2027-lote-fundadores' limit 1;

  if _offering_id is null then
    insert into public.offerings(
      tenant_id,experience_id,name,slug,status,available_from,available_until,
      sales_start,sales_end,capacity,currency_code,metadata
    ) values (
      _tenant_id,_experience_id,'Team Seffrin Experience — Brasília 2027 · 1º Lote Fundadores',
      'team-seffrin-brasilia-2027-lote-fundadores','active',
      '2027-04-16T00:00:00-03:00','2027-04-22T23:59:59-03:00',
      now(),'2027-04-15T23:59:59-03:00',5,'BRL',
      jsonb_build_object(
        'sales_public',false,'commercial_stage','checkout_qa',
        'commercial_terms_version','team-seffrin-2027-founders-v1',
        'cancellation_policy_version','pending-legal-review',
        'package_total_minor',999700,'entry_minor',199700,'balance_minor',800000,
        'balance_card_installments_max',12,'card_installment_fees_paid_by_customer',true,
        'source','team-seffrin-landing'
      )
    ) returning id into _offering_id;
  end if;

  select id into _sellable_id from public.sellables
  where tenant_id=_tenant_id and offering_id=_offering_id and status='active'
  order by created_at asc limit 1;

  if _sellable_id is null then
    perform set_config('app.w09_control','on',true);
    insert into public.sellables(
      tenant_id,sellable_kind,offering_id,name,description,status,metadata
    ) values (
      _tenant_id,'offering',_offering_id,null,
      'Team Seffrin Experience — Brasília 2027 · pacote por pessoa','active',
      jsonb_build_object('lot',1,'lot_capacity',5)
    ) returning id into _sellable_id;
    perform set_config('app.w09_control','off',true);
  end if;

  if not exists (
    select 1 from public.prices
    where tenant_id=_tenant_id and sellable_id=_sellable_id and status='active'
  ) then
    perform set_config('app.w09_control','on',true);
    insert into public.prices(
      tenant_id,sellable_id,currency,unit_amount_minor,price_basis,
      description,status,valid_from,valid_until,metadata
    ) values (
      _tenant_id,_sellable_id,'BRL',999700,'per_person',
      '1º Lote Fundadores — R$ 9.997 por pessoa','active',now(),
      '2027-04-15T23:59:59-03:00',
      jsonb_build_object(
        'entry_minor',199700,'balance_minor',800000,
        'balance_card_installments_max',12,'card_installment_fees_paid_by_customer',true
      )
    );
    perform set_config('app.w09_control','off',true);
  end if;

  insert into public.operation_commercial_configs(
    operation_id,tenant_id,offering_id,status,sales_public,commercial_terms_version,
    cancellation_policy_version,entry_minor,balance_minor,balance_card_installments_max,
    card_installment_fees_paid_by_customer,metadata
  ) values (
    _operation_id,_tenant_id,_offering_id,'active',false,
    'team-seffrin-2027-founders-v1','pending-legal-review',199700,800000,12,true,
    jsonb_build_object('source','team-seffrin-landing','checkout_stage','qa')
  )
  on conflict (operation_id) do update set
    offering_id=excluded.offering_id,status='active',sales_public=false,
    commercial_terms_version=excluded.commercial_terms_version,
    cancellation_policy_version=excluded.cancellation_policy_version,
    entry_minor=excluded.entry_minor,balance_minor=excluded.balance_minor,
    balance_card_installments_max=excluded.balance_card_installments_max,
    card_installment_fees_paid_by_customer=excluded.card_installment_fees_paid_by_customer,
    metadata=excluded.metadata,updated_at=now();
end
$seed$;
