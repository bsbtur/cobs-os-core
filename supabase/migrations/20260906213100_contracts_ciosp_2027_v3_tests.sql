-- pgTAP-free migration assertions: fail migration verification if V3 safety invariants regress.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and indexname='customer_contracts_live_order_template_uidx'
  ) then
    raise exception 'missing live contract idempotency index';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid='public.contract_templates'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%provider_template_id%'
      and pg_get_constraintdef(oid) ilike '%active%'
  ) then
    raise exception 'contract template activation still coupled to provider_template_id';
  end if;
end $$;
