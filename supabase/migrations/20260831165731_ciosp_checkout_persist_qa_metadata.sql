-- Persist protected CIOSP QA metadata inside the approved commerce command.
-- Public sales remain fail-closed; _allow_closed is supplied only after Edge auth/membership checks in TEST.
create or replace function public.create_public_checkout_order(_operation_code text, _full_name text, _email text, _phone_e164 text, _checkout_token_hash text, _idempotency_key text, _allow_closed boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _op public.operations;
  _off public.offerings;
  _person_id uuid;
  _sell public.sellables;
  _price public.prices;
  _order_id uuid;
  _item public.order_items;
  _totals jsonb;
  _existing public.orders;
  _session_id uuid;
  _entry_minor bigint;
  _order_metadata jsonb;
begin
  if nullif(btrim(coalesce(_operation_code,'')),'') is null then raise exception 'Operation code is required'; end if;
  if nullif(btrim(coalesce(_full_name,'')),'') is null then raise exception 'Full name is required'; end if;
  if nullif(btrim(coalesce(_email,'')),'') is null then raise exception 'Email is required'; end if;
  if nullif(btrim(coalesce(_checkout_token_hash,'')),'') is null then raise exception 'Checkout token hash is required'; end if;
  if length(_checkout_token_hash) <> 64 then raise exception 'Invalid checkout token hash'; end if;
  if nullif(btrim(coalesce(_idempotency_key,'')),'') is null then raise exception 'Idempotency key is required'; end if;

  select * into _op from public.operations o where o.code=btrim(_operation_code) and o.archived_at is null limit 1;
  if _op.id is null or _op.offering_id is null then raise exception 'Checkout operation is not configured'; end if;
  if _op.status in ('completed','cancelled') then raise exception 'Checkout operation is closed'; end if;

  select * into _off from public.offerings o where o.id=_op.offering_id and o.tenant_id=_op.tenant_id;
  if _off.id is null or _off.status <> 'active' then raise exception 'Offering is not active'; end if;
  if not _allow_closed and coalesce((_off.metadata->>'sales_public')::boolean,false) is not true then raise exception 'Public sales are not open'; end if;

  select * into _existing from public.orders o
   where o.tenant_id=_op.tenant_id and o.metadata->>'public_checkout_idempotency_key'=btrim(_idempotency_key)
   order by o.created_at desc limit 1;
  if _existing.id is not null then
    if _allow_closed and coalesce((_existing.metadata->>'qa_public_checkout')::boolean,false) is not true then
      perform set_config('app.w09_control','on',true);
      update public.orders set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('qa_public_checkout',true,'qa_environment','test','qa_sales_public_bypass',true) where id=_existing.id;
      perform set_config('app.w09_control','off',true);
    end if;
    select s.id into _session_id from public.public_checkout_sessions s where s.order_id=_existing.id limit 1;
    return jsonb_build_object('order_id',_existing.id,'status',_existing.status,'session_id',_session_id,'reused',true,'total_minor',_existing.grand_total_minor,'entry_minor',coalesce((_off.metadata->>'entry_minor')::bigint,_existing.grand_total_minor));
  end if;

  select p.id into _person_id from public.people p where p.tenant_id=_op.tenant_id and lower(coalesce(p.email,''))=lower(btrim(_email)) order by p.created_at asc limit 1;
  if _person_id is null then
    insert into public.people(tenant_id,full_name,email,phone_e164,preferred_locale) values(_op.tenant_id,btrim(_full_name),lower(btrim(_email)),nullif(btrim(coalesce(_phone_e164,'')),''),'pt-BR') returning id into _person_id;
  end if;

  select * into _sell from public.sellables s where s.tenant_id=_op.tenant_id and s.offering_id=_off.id and s.status='active' order by s.created_at asc limit 1;
  if _sell.id is null then raise exception 'Active sellable not found'; end if;
  _price := app_private.w09_resolve_active_price(_sell.id,'BRL');

  _order_metadata := jsonb_build_object('source','public_checkout','public_checkout_idempotency_key',btrim(_idempotency_key));
  if _allow_closed then _order_metadata := _order_metadata || jsonb_build_object('qa_public_checkout',true,'qa_environment','test','qa_sales_public_bypass',true); end if;

  perform set_config('app.w09_control','on',true);
  insert into public.orders(tenant_id,operation_id,buyer_person_id,buyer_name_snapshot,currency,status,reference_label,metadata,created_by)
  values(_op.tenant_id,_op.id,_person_id,btrim(_full_name),'BRL','draft','CIOSP 2027 — checkout público',_order_metadata,null) returning id into _order_id;

  insert into public.order_items(tenant_id,order_id,sellable_id,price_id,offering_id,sellable_kind,sellable_name_snapshot,description_snapshot,price_basis,currency,unit_amount_minor,quantity,discount_minor,line_subtotal_minor,line_total_minor,beneficiary_person_id,created_by)
  values(_op.tenant_id,_order_id,_sell.id,_price.id,_sell.offering_id,_sell.sellable_kind,_off.name,coalesce(_price.description,_sell.description),_price.price_basis,'BRL',_price.unit_amount_minor,1,0,_price.unit_amount_minor,_price.unit_amount_minor,_person_id,null) returning * into _item;
  perform set_config('app.w09_control','off',true);

  _totals := app_private.w09_compute_order_totals(_order_id);
  perform app_private.w09_reserve_or_reacquire(_item,'reserved');
  perform set_config('app.w09_control','on',true);
  update public.orders set status='submitted',submitted_at=now(),submitted_by=null,subtotal_minor=(_totals->>'subtotal_minor')::bigint,discount_total_minor=(_totals->>'discount_total_minor')::bigint,grand_total_minor=(_totals->>'grand_total_minor')::bigint where id=_order_id;
  perform set_config('app.w09_control','off',true);

  insert into public.public_checkout_sessions(tenant_id,order_id,token_hash,status,expires_at) values(_op.tenant_id,_order_id,btrim(_checkout_token_hash),'active',now()+interval '2 hours') returning id into _session_id;
  _entry_minor := coalesce((_off.metadata->>'entry_minor')::bigint,(_totals->>'grand_total_minor')::bigint);
  return jsonb_build_object('order_id',_order_id,'status','submitted','session_id',_session_id,'reused',false,'total_minor',(_totals->>'grand_total_minor')::bigint,'entry_minor',_entry_minor);
end;
$function$;
