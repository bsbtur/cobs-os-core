-- CIOSP 2027 commercial v2: one Pix entry + card balance.
-- Preserve historical v1 acceptances on existing orders; only active offering/price move to v2.
do $$
declare _offering_id uuid := 'f88ed059-80b0-44d5-8755-1344c4360e84';
begin
  update public.offerings
  set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'commercial_release','v2',
    'commercial_terms_version','ciosp-2027-v2',
    'entry_minor',349000,
    'balance_minor',900000,
    'payment_installment_count',2,
    'payment_schedule_v2',jsonb_build_array(
      jsonb_build_object('installment_number',1,'kind','entry','method','pix','amount_minor',349000,'due_rule','at_contract'),
      jsonb_build_object('installment_number',2,'kind','card_balance','method','credit_card','amount_minor',900000,'due_rule','after_entry')
    )
  )
  where id=_offering_id and status='active'
    and coalesce((metadata->>'target_unit_price_minor')::integer,0)=1249000;

  update public.prices
  set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('commercial_terms_version','ciosp-2027-v2')
  where sellable_id in (select id from public.sellables where offering_id=_offering_id and status='active')
    and status='active' and unit_amount_minor=1249000;
end $$;
