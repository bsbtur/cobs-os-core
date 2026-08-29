create or replace function public.ensure_order_reservation_for_payment(_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _o public.orders;
  _item public.order_items;
  _reservation_id uuid;
  _reservation_ids uuid[] := '{}';
begin
  select * into _o from public.orders o where o.id=_order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;
  if _o.status not in ('submitted','confirmed') then raise exception 'Order is not payable'; end if;

  for _item in
    select * from public.order_items i
    where i.order_id=_order_id and i.offering_id is not null
    order by i.offering_id,i.id
  loop
    _reservation_id := app_private.w09_reserve_or_reacquire(_item,'reserved');
    if _reservation_id is not null then
      _reservation_ids := array_append(_reservation_ids,_reservation_id);
    end if;
  end loop;

  return jsonb_build_object(
    'order_id', _order_id,
    'reservation_ids', to_jsonb(_reservation_ids),
    'reservation_id', case when cardinality(_reservation_ids)>0 then _reservation_ids[1] else null end
  );
end;
$function$;

create or replace function public.materialize_paid_order_participations(_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _o public.orders;
  _beneficiary_id uuid;
  _existing public.operation_participations;
  _participation_id uuid;
  _ids uuid[] := '{}';
  _created integer := 0;
  _promoted integer := 0;
  _unchanged integer := 0;
  _cancelled_conflicts integer := 0;
begin
  select * into _o from public.orders o where o.id = _order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;
  if _o.status <> 'confirmed' then raise exception 'Only a confirmed order can materialize operation participations'; end if;
  if _o.operation_id is null then
    return jsonb_build_object('order_id', _order_id,'operation_id', null,'created', 0,'promoted', 0,'unchanged', 0,'cancelled_conflicts', 0,'participation_ids', '[]'::jsonb,'skipped', 'order_has_no_operation');
  end if;

  for _beneficiary_id in
    select distinct i.beneficiary_person_id
      from public.order_items i
     where i.order_id = _order_id
       and i.offering_id is not null
       and i.beneficiary_person_id is not null
  loop
    select * into _existing from public.operation_participations p
     where p.operation_id = _o.operation_id and p.person_id = _beneficiary_id for update;

    if _existing.id is null then
      insert into public.operation_participations(tenant_id,operation_id,person_id,participation_kind,status,confirmed_at,created_by)
      values (_o.tenant_id,_o.operation_id,_beneficiary_id,'participant'::public.participation_kind,'confirmed'::public.participation_status,now(),null)
      returning id into _participation_id;
      _created := _created + 1;
      _ids := array_append(_ids, _participation_id);
      perform app_private.record_audit_event(_o.tenant_id,null,'commerce.participation_materialized_from_paid_order','operation_participation',_participation_id,null,jsonb_build_object('order_id', _order_id,'operation_id', _o.operation_id,'person_id', _beneficiary_id));
    elsif _existing.status = 'expected'::public.participation_status then
      update public.operation_participations
         set status = 'confirmed'::public.participation_status,
             confirmed_at = coalesce(confirmed_at, now()),
             updated_at = now()
       where id = _existing.id
      returning id into _participation_id;
      _promoted := _promoted + 1;
      _ids := array_append(_ids, _participation_id);
      perform app_private.record_audit_event(_o.tenant_id,null,'commerce.participation_confirmed_from_paid_order','operation_participation',_participation_id,null,jsonb_build_object('order_id', _order_id));
    elsif _existing.status = 'confirmed'::public.participation_status then
      _unchanged := _unchanged + 1;
      _ids := array_append(_ids, _existing.id);
    else
      _cancelled_conflicts := _cancelled_conflicts + 1;
      _ids := array_append(_ids, _existing.id);
    end if;
  end loop;

  return jsonb_build_object('order_id', _order_id,'operation_id', _o.operation_id,'created', _created,'promoted', _promoted,'unchanged', _unchanged,'cancelled_conflicts', _cancelled_conflicts,'participation_ids', to_jsonb(_ids));
end;
$function$;

create or replace function public.confirm_paid_provider_order(_order_id uuid, _charge_id uuid, _provider_reference text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _o public.orders;
  _c public.payment_charges;
  _item public.order_items;
  _paid bigint;
  _result jsonb;
  _participations jsonb;
begin
  select * into _o from public.orders o where o.id=_order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;

  select * into _c from public.payment_charges c where c.id=_charge_id for update;
  if _c.id is null then raise exception 'Charge not found'; end if;
  if _c.order_id <> _order_id or _c.tenant_id <> _o.tenant_id then raise exception 'Charge/order mismatch'; end if;
  if _c.provider <> 'mercado_pago'::public.payment_provider then raise exception 'Unsupported provider'; end if;
  if _c.status <> 'paid'::public.payment_charge_status then raise exception 'Charge is not paid'; end if;

  select coalesce(sum(case when f.fact_type='PAYMENT_RECORDED' then f.amount_minor when f.fact_type in ('PAYMENT_REVERSED','REFUND_RECORDED') then -f.amount_minor else 0 end),0)
    into _paid from public.financial_facts f where f.order_id=_order_id;
  if _paid < coalesce(_o.grand_total_minor,0) then raise exception 'Order is not fully paid'; end if;

  if _o.status='confirmed' then
    _participations := public.materialize_paid_order_participations(_order_id);
    return jsonb_build_object('order_id',_order_id,'status','confirmed','unchanged',true,'participations',_participations);
  end if;
  if _o.status<>'submitted' then raise exception 'Only a submitted order can be provider-confirmed'; end if;

  for _item in select * from public.order_items i where i.order_id=_order_id and i.offering_id is not null order by i.offering_id,i.id loop
    perform app_private.w09_reserve_or_reacquire(_item,'confirmed');
  end loop;

  perform set_config('app.w09_control','on',true);
  update public.orders
     set status='confirmed', confirmed_at=now(), confirmed_by=null,
         metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('provider_confirmation',jsonb_build_object('provider','mercado_pago','charge_id',_charge_id,'reference',_provider_reference,'confirmed_at',now()))
   where id=_order_id;
  perform set_config('app.w09_control','off',true);

  perform app_private.record_audit_event(_o.tenant_id,null,'commerce.order_confirmed_by_provider','order',_order_id,null,jsonb_build_object('charge_id',_charge_id,'provider','mercado_pago','reference',_provider_reference));
  _participations := public.materialize_paid_order_participations(_order_id);
  _result:=jsonb_build_object('order_id',_order_id,'status','confirmed','unchanged',false,'charge_id',_charge_id,'participations',_participations);
  return _result;
end;
$function$;

revoke all on function public.ensure_order_reservation_for_payment(uuid) from public, anon, authenticated;
revoke all on function public.materialize_paid_order_participations(uuid) from public, anon, authenticated;
revoke all on function public.confirm_paid_provider_order(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.ensure_order_reservation_for_payment(uuid) to service_role;
grant execute on function public.materialize_paid_order_participations(uuid) to service_role;
grant execute on function public.confirm_paid_provider_order(uuid,uuid,text) to service_role;
