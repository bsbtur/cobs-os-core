-- Make the legacy CIOSP charge trigger schedule-aware.
-- The Edge Function is authoritative for amount/installment selection.
-- This trigger only enriches/guards charges and never rewrites an explicit schedule-aware charge.
create or replace function app_private.ciosp_apply_commercial_entry_charge()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _entry_minor bigint;
  _paid bigint;
  _count integer;
begin
  if new.provider <> 'mercado_pago'::public.payment_provider or new.order_id is null then return new; end if;

  if new.installment_number is not null and new.installment_count is not null then
    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('schedule_aware',true);
    return new;
  end if;

  select min((off.metadata->>'entry_minor')::bigint), max(coalesce((off.metadata->>'payment_installment_count')::integer,2))
    into _entry_minor,_count
  from public.order_items i
  join public.offerings off on off.id=i.offering_id
  where i.order_id=new.order_id
    and (off.metadata ? 'entry_minor')
    and (off.metadata->>'entry_minor') ~ '^[0-9]+$';

  if _entry_minor is null or _entry_minor <= 0 then return new; end if;

  select coalesce(sum(case when f.fact_type='PAYMENT_RECORDED' then f.amount_minor when f.fact_type in ('PAYMENT_REVERSED','REFUND_RECORDED') then -f.amount_minor else 0 end),0)
    into _paid from public.financial_facts f where f.order_id=new.order_id;

  if _paid <= 0 and new.amount_minor > _entry_minor then
    new.amount_minor := _entry_minor;
    new.installment_number := 1;
    new.installment_count := greatest(coalesce(_count,2),2);
    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('commercial_payment_stage','entry','entry_minor',_entry_minor,'legacy_fallback',true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ciosp_commercial_entry_charge on public.payment_charges;
create trigger trg_ciosp_commercial_entry_charge
before insert on public.payment_charges
for each row execute function app_private.ciosp_apply_commercial_entry_charge();
