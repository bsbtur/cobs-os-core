-- CIOSP Experience 2027 — approved commercial terms v1
-- Decision approved in commercial release gate on 2026-09-03.
-- IMPORTANT: this migration DOES NOT open public sales.
-- Migration context uses the same W09 control boundary used by the governed
-- commerce command surface. Public/runtime mutations remain guarded.

DO $$
DECLARE
  _operation_id uuid;
  _offering_id uuid;
  _sellable_id uuid;
  _old_price_id uuid;
  _tenant_id uuid;
  _new_price_id uuid;
  _now timestamptz := clock_timestamp();
  _offering_metadata jsonb;
  _sellable_metadata jsonb;
BEGIN
  SELECT o.id, o.offering_id, o.tenant_id
    INTO _operation_id, _offering_id, _tenant_id
  FROM public.operations o
  WHERE o.code = 'CIOSP-SP-2027' AND o.archived_at IS NULL
  ORDER BY o.created_at DESC LIMIT 1;

  IF _operation_id IS NULL OR _offering_id IS NULL THEN
    RAISE EXCEPTION 'Canonical CIOSP-SP-2027 operation/offering not found';
  END IF;

  SELECT s.id, coalesce(s.metadata,'{}'::jsonb)
    INTO _sellable_id, _sellable_metadata
  FROM public.sellables s
  WHERE s.offering_id = _offering_id AND s.status = 'active'
  ORDER BY s.created_at DESC LIMIT 1;

  IF _sellable_id IS NULL THEN RAISE EXCEPTION 'Active CIOSP 2027 sellable not found'; END IF;

  SELECT coalesce(o.metadata,'{}'::jsonb) INTO _offering_metadata
  FROM public.offerings o WHERE o.id=_offering_id;

  SELECT p.id INTO _old_price_id
  FROM public.prices p
  WHERE p.sellable_id = _sellable_id AND p.status = 'active' AND p.currency = 'BRL'
    AND (p.valid_until IS NULL OR p.valid_until > _now)
  ORDER BY p.created_at DESC LIMIT 1;

  IF _old_price_id IS NULL THEN RAISE EXCEPTION 'Active CIOSP 2027 BRL price not found'; END IF;

  -- Fail closed if a different active approved-v1 price already exists.
  SELECT p.id INTO _new_price_id
  FROM public.prices p
  WHERE p.sellable_id=_sellable_id AND p.currency='BRL' AND p.status='active'
    AND p.unit_amount_minor=1249000
    AND coalesce(p.metadata->>'commercial_terms_version','')='ciosp-2027-v1'
  ORDER BY p.created_at DESC LIMIT 1;

  perform set_config('app.w09_control','on',true);

  UPDATE public.offerings
  SET metadata = _offering_metadata || jsonb_build_object(
    'entry_minor',349000,
    'balance_minor',900000,
    'target_unit_price_minor',1249000,
    'payment_installment_count',4,
    'payment_schedule_v1',jsonb_build_array(
      jsonb_build_object('installment_number',1,'kind','entry','amount_minor',349000,'due_rule','at_contract'),
      jsonb_build_object('installment_number',2,'kind','installment','amount_minor',300000,'due_date','2026-10-10'),
      jsonb_build_object('installment_number',3,'kind','installment','amount_minor',300000,'due_date','2026-11-10'),
      jsonb_build_object('installment_number',4,'kind','installment','amount_minor',300000,'due_date','2026-12-10')
    ),
    'commercial_terms_version','ciosp-2027-v1',
    'commercial_terms_approved_at','2026-09-03T21:54:00-03:00',
    'sales_public',false
  ), updated_at=_now
  WHERE id=_offering_id;

  UPDATE public.sellables
  SET metadata = _sellable_metadata || jsonb_build_object(
    'pricing_state','approved_qa','commercial_terms_version','ciosp-2027-v1','sales_public',false
  ), updated_at=_now
  WHERE id=_sellable_id;

  IF _new_price_id IS NULL THEN
    -- Preserve historical price instead of rewriting its amount.
    UPDATE public.prices
       SET valid_until = CASE WHEN valid_until IS NULL THEN _now ELSE valid_until END,
           updated_at = _now
     WHERE id=_old_price_id;

    INSERT INTO public.prices
      (tenant_id,sellable_id,currency,unit_amount_minor,price_basis,description,valid_from,metadata,created_by)
    SELECT _tenant_id,_sellable_id,'BRL',1249000,p.price_basis,
      'CIOSP Experience 2027 — R$ 12.490 por passageiro, acomodacao dupla. Condicao aprovada: R$ 3.490 na contratacao + 3x R$ 3.000. VENDAS PUBLICAS AINDA FECHADAS PARA QA.',
      _now,
      jsonb_build_object('pricing_state','approved_qa','commercial_terms_version','ciosp-2027-v1','sales_public',false),
      auth.uid()
    FROM public.prices p WHERE p.id=_old_price_id
    RETURNING id INTO _new_price_id;
  END IF;

  perform set_config('app.w09_control','off',true);

  IF _new_price_id IS NULL THEN RAISE EXCEPTION 'Failed to create/canonize CIOSP 2027 approved price'; END IF;
END $$;
