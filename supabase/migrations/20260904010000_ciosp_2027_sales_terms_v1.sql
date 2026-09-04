-- CIOSP Experience 2027 — approved commercial terms v1
-- Decision approved in commercial release gate on 2026-09-03.
-- IMPORTANT: this migration DOES NOT open public sales.

DO $$
DECLARE
  _operation_id uuid;
  _offering_id uuid;
  _sellable_id uuid;
  _price_id uuid;
BEGIN
  SELECT id, offering_id INTO _operation_id, _offering_id
  FROM public.operations
  WHERE code = 'CIOSP-SP-2027' AND archived_at IS NULL
  ORDER BY created_at DESC LIMIT 1;

  IF _operation_id IS NULL OR _offering_id IS NULL THEN
    RAISE EXCEPTION 'Canonical CIOSP-SP-2027 operation/offering not found';
  END IF;

  SELECT id INTO _sellable_id
  FROM public.sellables
  WHERE offering_id = _offering_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF _sellable_id IS NULL THEN RAISE EXCEPTION 'Active CIOSP 2027 sellable not found'; END IF;

  SELECT id INTO _price_id
  FROM public.prices
  WHERE sellable_id = _sellable_id AND status = 'active' AND currency = 'BRL'
  ORDER BY created_at DESC LIMIT 1;

  IF _price_id IS NULL THEN RAISE EXCEPTION 'Active CIOSP 2027 BRL price not found'; END IF;

  UPDATE public.offerings
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'entry_minor', 349000,
    'balance_minor', 900000,
    'target_unit_price_minor', 1249000,
    'payment_installment_count', 4,
    'payment_schedule_v1', jsonb_build_array(
      jsonb_build_object('installment_number',1,'kind','entry','amount_minor',349000,'due_rule','at_contract'),
      jsonb_build_object('installment_number',2,'kind','installment','amount_minor',300000,'due_date','2026-10-10'),
      jsonb_build_object('installment_number',3,'kind','installment','amount_minor',300000,'due_date','2026-11-10'),
      jsonb_build_object('installment_number',4,'kind','installment','amount_minor',300000,'due_date','2026-12-10')
    ),
    'commercial_terms_version','ciosp-2027-v1',
    'commercial_terms_approved_at','2026-09-03T21:54:00-03:00',
    'sales_public',false
  ), updated_at=now()
  WHERE id=_offering_id;

  UPDATE public.sellables
  SET metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'pricing_state','approved_qa','commercial_terms_version','ciosp-2027-v1','sales_public',false
  ), updated_at=now()
  WHERE id=_sellable_id;

  UPDATE public.prices
  SET unit_amount_minor=1249000,
      description='CIOSP Experience 2027 — R$ 12.490 por passageiro, acomodacao dupla. Condicao aprovada: R$ 3.490 na contratacao + 3x R$ 3.000. VENDAS PUBLICAS AINDA FECHADAS PARA QA.',
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'pricing_state','approved_qa','commercial_terms_version','ciosp-2027-v1','sales_public',false
      ), updated_at=now()
  WHERE id=_price_id;
END $$;
