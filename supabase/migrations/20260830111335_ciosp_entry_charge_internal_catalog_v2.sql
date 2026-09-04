create or replace function app_private.ciosp_apply_commercial_entry_charge()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
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
    and o2.status = 'active'
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
$function$;