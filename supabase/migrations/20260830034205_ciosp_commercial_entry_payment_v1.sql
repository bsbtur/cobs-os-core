create or replace function app_private.ciosp_apply_commercial_entry_charge()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _entry_minor bigint;
  _paid bigint;
begin
  if new.provider <> 'mercado_pago'::public.payment_provider or new.order_id is null then
    return new;
  end if;

  select min((o2.metadata->>'entry_minor')::bigint)
    into _entry_minor
  from public.order_items i
  join public.offerings o2 on o2.id = i.offering_id
  where i.order_id = new.order_id
    and coalesce((o2.metadata->>'sales_public')::boolean, false) = true
    and (o2.metadata ? 'entry_minor')
    and (o2.metadata->>'entry_minor') ~ '^[0-9]+$';

  if _entry_minor is null or _entry_minor <= 0 then
    return new;
  end if;

  select coalesce(sum(case
    when f.fact_type='PAYMENT_RECORDED' then f.amount_minor
    when f.fact_type in ('PAYMENT_REVERSED','REFUND_RECORDED') then -f.amount_minor
    else 0 end),0)
    into _paid
  from public.financial_facts f
  where f.order_id = new.order_id;

  if _paid <= 0 and new.amount_minor > _entry_minor then
    new.amount_minor := _entry_minor;
    new.installment_number := 1;
    new.installment_count := 2;
    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
      'commercial_payment_stage','entry',
      'entry_minor',_entry_minor
    );
  elsif _paid > 0 then
    new.installment_number := 2;
    new.installment_count := 2;
    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
      'commercial_payment_stage','balance',
      'paid_before_minor',_paid
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ciosp_commercial_entry_charge on public.payment_charges;
create trigger trg_ciosp_commercial_entry_charge
before insert on public.payment_charges
for each row execute function app_private.ciosp_apply_commercial_entry_charge();

create or replace function public.confirm_paid_provider_order(_order_id uuid, _charge_id uuid, _provider_reference text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _o public.orders;
  _c public.payment_charges;
  _item public.order_items;
  _paid bigint;
  _required_paid bigint;
  _entry_minor bigint;
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

  select min((off.metadata->>'entry_minor')::bigint)
    into _entry_minor
  from public.order_items i
  join public.offerings off on off.id=i.offering_id
  where i.order_id=_order_id
    and coalesce((off.metadata->>'sales_public')::boolean,false)=true
    and (off.metadata ? 'entry_minor')
    and (off.metadata->>'entry_minor') ~ '^[0-9]+$';

  _required_paid := case
    when _entry_minor is not null and _entry_minor > 0 and _entry_minor <= coalesce(_o.grand_total_minor,0)
      then _entry_minor
    else coalesce(_o.grand_total_minor,0)
  end;

  select coalesce(sum(case when f.fact_type='PAYMENT_RECORDED' then f.amount_minor when f.fact_type in ('PAYMENT_REVERSED','REFUND_RECORDED') then -f.amount_minor else 0 end),0)
    into _paid from public.financial_facts f where f.order_id=_order_id;
  if _paid < _required_paid then raise exception 'Order has not reached provider confirmation threshold'; end if;

  if _o.status='confirmed' then
    _participations := public.materialize_paid_order_participations(_order_id);
    return jsonb_build_object('order_id',_order_id,'status','confirmed','unchanged',true,'paid_minor',_paid,'confirmation_threshold_minor',_required_paid,'fully_paid',(_paid >= coalesce(_o.grand_total_minor,0)),'participations',_participations);
  end if;
  if _o.status<>'submitted' then raise exception 'Only a submitted order can be provider-confirmed'; end if;

  for _item in select * from public.order_items i where i.order_id=_order_id and i.offering_id is not null order by i.offering_id,i.id loop
    perform app_private.w09_reserve_or_reacquire(_item,'confirmed');
  end loop;

  perform set_config('app.w09_control','on',true);
  update public.orders
     set status='confirmed', confirmed_at=now(), confirmed_by=null,
         metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('provider_confirmation',jsonb_build_object('provider','mercado_pago','charge_id',_charge_id,'reference',_provider_reference,'confirmed_at',now(),'paid_minor',_paid,'confirmation_threshold_minor',_required_paid,'fully_paid',(_paid >= coalesce(_o.grand_total_minor,0))))
   where id=_order_id;
  perform set_config('app.w09_control','off',true);

  perform app_private.record_audit_event(_o.tenant_id,null,'commerce.order_confirmed_by_provider','order',_order_id,null,jsonb_build_object('charge_id',_charge_id,'provider','mercado_pago','reference',_provider_reference,'paid_minor',_paid,'confirmation_threshold_minor',_required_paid,'fully_paid',(_paid >= coalesce(_o.grand_total_minor,0))));
  _participations := public.materialize_paid_order_participations(_order_id);
  _result:=jsonb_build_object('order_id',_order_id,'status','confirmed','unchanged',false,'charge_id',_charge_id,'paid_minor',_paid,'confirmation_threshold_minor',_required_paid,'fully_paid',(_paid >= coalesce(_o.grand_total_minor,0)),'participations',_participations);
  return _result;
end;
$$;