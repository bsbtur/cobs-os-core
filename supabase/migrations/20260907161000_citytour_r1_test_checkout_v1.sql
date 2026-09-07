-- City Tour R$1 Golden Path: TEST-only checkout foundation.
-- Resolves operation/sellable/price by stable keys; never enables production sales.

create or replace function public.create_citytour_test_checkout_order(
  _operation_code text,
  _fixture_key text,
  _full_name text,
  _email text,
  _phone_e164 text,
  _checkout_token_hash text,
  _idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _op public.operations;
  _off public.offerings;
  _sell public.sellables;
  _price public.prices;
  _person_id uuid;
  _order_id uuid;
  _item public.order_items;
  _totals jsonb;
  _existing public.orders;
  _session_id uuid;
  _active_count integer;
begin
  if nullif(btrim(coalesce(_operation_code,'')),'') is null then raise exception 'Operation code is required'; end if;
  if nullif(btrim(coalesce(_fixture_key,'')),'') is null then raise exception 'Fixture key is required'; end if;
  if nullif(btrim(coalesce(_full_name,'')),'') is null then raise exception 'Full name is required'; end if;
  if nullif(btrim(coalesce(_email,'')),'') is null then raise exception 'Email is required'; end if;
  if length(coalesce(_checkout_token_hash,'')) <> 64 then raise exception 'Invalid checkout token hash'; end if;
  if nullif(btrim(coalesce(_idempotency_key,'')),'') is null then raise exception 'Idempotency key is required'; end if;

  select * into _op
  from public.operations o
  where o.code=btrim(_operation_code)
    and o.archived_at is null;
  if _op.id is null or _op.offering_id is null then raise exception 'Checkout operation is not configured'; end if;
  if _op.status in ('completed','cancelled') then raise exception 'Checkout operation is closed'; end if;

  select * into _off
  from public.offerings o
  where o.id=_op.offering_id and o.tenant_id=_op.tenant_id and o.status='active';
  if _off.id is null then raise exception 'Offering is not active'; end if;

  select * into _sell
  from public.sellables s
  where s.tenant_id=_op.tenant_id
    and s.offering_id=_off.id
    and s.status='active'
    and s.metadata->>'qa_fixture_key'=btrim(_fixture_key)
    and coalesce((s.metadata->>'qa')::boolean,false)=true
    and s.metadata->>'environment'='test';
  if _sell.id is null then raise exception 'TEST sellable not found'; end if;

  select * into _price
  from public.prices p
  where p.tenant_id=_op.tenant_id
    and p.sellable_id=_sell.id
    and p.status='active'
    and p.currency='BRL'
    and p.valid_from <= now()
    and (p.valid_until is null or p.valid_until > now())
    and coalesce((p.metadata->>'qa')::boolean,false)=true
    and p.metadata->>'environment'='test'
    and p.metadata->>'qa_fixture_key'=btrim(_fixture_key);
  if _price.id is null then raise exception 'TEST price not found'; end if;
  if _price.unit_amount_minor <> 100 then raise exception 'City Tour QA price must be R$ 1.00'; end if;

  select * into _existing
  from public.orders o
  where o.tenant_id=_op.tenant_id
    and o.metadata->>'qa_fixture_key'=btrim(_fixture_key)
    and o.metadata->>'public_checkout_idempotency_key'=btrim(_idempotency_key)
  order by o.created_at desc
  limit 1;
  if _existing.id is not null then
    select s.id into _session_id
    from public.public_checkout_sessions s
    where s.order_id=_existing.id
    order by s.created_at desc limit 1;
    return jsonb_build_object(
      'order_id',_existing.id,'status',_existing.status,'session_id',_session_id,
      'reused',true,'total_minor',_existing.grand_total_minor,'environment','test'
    );
  end if;

  select count(*) into _active_count
  from public.orders o
  where o.tenant_id=_op.tenant_id
    and o.operation_id=_op.id
    and o.metadata->>'qa_fixture_key'=btrim(_fixture_key)
    and o.status in ('draft','submitted','confirmed');
  if _active_count >= 2 then raise exception 'City Tour QA validation capacity reached'; end if;

  select p.id into _person_id
  from public.people p
  where p.tenant_id=_op.tenant_id and lower(coalesce(p.email,''))=lower(btrim(_email))
  order by p.created_at asc limit 1;
  if _person_id is null then
    insert into public.people(tenant_id,full_name,email,phone_e164,preferred_locale,notes)
    values(
      _op.tenant_id,btrim(_full_name),lower(btrim(_email)),nullif(btrim(coalesce(_phone_e164,'')),''),'pt-BR',
      'QA City Tour R$1 — Golden Path TEST'
    ) returning id into _person_id;
  end if;

  perform set_config('app.w09_control','on',true);
  insert into public.orders(
    tenant_id,operation_id,buyer_person_id,buyer_name_snapshot,currency,status,reference_label,metadata,created_by
  ) values(
    _op.tenant_id,_op.id,_person_id,btrim(_full_name),'BRL','draft','City Tour Brasília — QA R$ 1,00',
    jsonb_build_object(
      'source','citytour_test_checkout',
      'qa',true,
      'qa_public_checkout',true,
      'qa_environment','test',
      'environment','test',
      'qa_fixture_key',btrim(_fixture_key),
      'public_checkout_idempotency_key',btrim(_idempotency_key),
      'contract_gate_validation',true
    ),null
  ) returning id into _order_id;

  insert into public.order_items(
    tenant_id,order_id,sellable_id,price_id,offering_id,sellable_kind,sellable_name_snapshot,description_snapshot,
    price_basis,currency,unit_amount_minor,quantity,discount_minor,line_subtotal_minor,line_total_minor,
    beneficiary_person_id,metadata,created_by
  ) values(
    _op.tenant_id,_order_id,_sell.id,_price.id,_sell.offering_id,_sell.sellable_kind,
    coalesce(_sell.metadata->>'display_name',_off.name),coalesce(_price.description,_sell.description),
    _price.price_basis,'BRL',_price.unit_amount_minor,1,0,_price.unit_amount_minor,_price.unit_amount_minor,
    _person_id,jsonb_build_object('qa',true,'environment','test','qa_fixture_key',btrim(_fixture_key)),null
  ) returning * into _item;
  perform set_config('app.w09_control','off',true);

  _totals := app_private.w09_compute_order_totals(_order_id);
  perform app_private.w09_reserve_or_reacquire(_item,'reserved');

  perform set_config('app.w09_control','on',true);
  update public.orders set
    status='submitted',submitted_at=now(),submitted_by=null,
    subtotal_minor=(_totals->>'subtotal_minor')::bigint,
    discount_total_minor=(_totals->>'discount_total_minor')::bigint,
    grand_total_minor=(_totals->>'grand_total_minor')::bigint
  where id=_order_id;
  perform set_config('app.w09_control','off',true);

  if (_totals->>'grand_total_minor')::bigint <> 100 then raise exception 'Unexpected City Tour QA total'; end if;

  insert into public.public_checkout_sessions(tenant_id,order_id,token_hash,status,expires_at)
  values(_op.tenant_id,_order_id,btrim(_checkout_token_hash),'active',now()+interval '2 hours')
  returning id into _session_id;

  return jsonb_build_object(
    'order_id',_order_id,'status','submitted','session_id',_session_id,
    'reused',false,'total_minor',100,'environment','test'
  );
end;
$function$;

revoke all on function public.create_citytour_test_checkout_order(text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_citytour_test_checkout_order(text,text,text,text,text,text,text) to service_role;
