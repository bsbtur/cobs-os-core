-- CIOSP Experience 2027 — controlled public sales release.
-- Publishes only the approved R$ 12.490 price and archives the legacy R$ 9.990 price.

DO $$
DECLARE
  _operation_id constant uuid := '8c84e916-d24b-4341-a711-a75d62a7b468';
  _offering_id constant uuid := '3d245cdf-731b-42fa-9ad1-0b242818ae02';
  _sellable_id constant uuid := '3fb5a457-9f9e-4200-a39f-79b6c8c84968';
  _approved_price_id constant uuid := '90d3695d-057d-43db-8f2b-b4ab258306a5';
  _legacy_price_id constant uuid := '6f6d5ca8-8aed-49f5-beb6-968a48b2c16b';
  _tenant_id uuid;
  _offering_metadata jsonb;
  _sellable_metadata jsonb;
  _approved_price_metadata jsonb;
  _affected integer;
  _now timestamptz := clock_timestamp();
  _expected_schedule jsonb := jsonb_build_array(
    jsonb_build_object('installment_number',1,'kind','entry','amount_minor',349000,'due_rule','at_contract'),
    jsonb_build_object('installment_number',2,'kind','installment','amount_minor',300000,'due_date','2026-10-10'),
    jsonb_build_object('installment_number',3,'kind','installment','amount_minor',300000,'due_date','2026-11-10'),
    jsonb_build_object('installment_number',4,'kind','installment','amount_minor',300000,'due_date','2026-12-10')
  );
BEGIN
  SELECT op.tenant_id, coalesce(off.metadata, '{}'::jsonb), coalesce(s.metadata, '{}'::jsonb)
    INTO _tenant_id, _offering_metadata, _sellable_metadata
  FROM public.operations op
  JOIN public.offerings off ON off.id = op.offering_id AND off.tenant_id = op.tenant_id
  JOIN public.sellables s ON s.offering_id = off.id AND s.tenant_id = op.tenant_id
  WHERE op.id = _operation_id
    AND op.code = 'CIOSP-SP-2027'
    AND op.offering_id = _offering_id
    AND op.archived_at IS NULL
    AND off.status = 'active'
    AND off.capacity = 30
    AND s.id = _sellable_id
    AND s.status = 'active';

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'CIOSP public release preflight failed: canonical operation/offering/sellable mismatch';
  END IF;

  IF coalesce((_offering_metadata->>'entry_minor')::bigint, 0) <> 349000
     OR coalesce((_offering_metadata->>'balance_minor')::bigint, 0) <> 900000
     OR coalesce((_offering_metadata->>'target_unit_price_minor')::bigint, 0) <> 1249000
     OR coalesce((_offering_metadata->>'payment_installment_count')::integer, 0) <> 4
     OR coalesce(_offering_metadata->>'commercial_terms_version', '') <> 'ciosp-2027-v1'
     OR coalesce((_offering_metadata->>'max_paying_passengers')::integer, 0) <> 30
     OR coalesce(_offering_metadata->'payment_schedule_v1', '[]'::jsonb) <> _expected_schedule THEN
    RAISE EXCEPTION 'CIOSP public release preflight failed: approved commercial terms mismatch';
  END IF;

  SELECT coalesce(p.metadata, '{}'::jsonb)
    INTO _approved_price_metadata
  FROM public.prices p
  WHERE p.id = _approved_price_id
    AND p.tenant_id = _tenant_id
    AND p.sellable_id = _sellable_id
    AND p.status = 'active'
    AND p.currency = 'BRL'
    AND p.unit_amount_minor = 1249000
    AND p.price_basis = 'per_person'
    AND (p.valid_until IS NULL OR p.valid_until > _now);

  IF _approved_price_metadata IS NULL
     OR coalesce(_approved_price_metadata->>'commercial_terms_version', '') <> 'ciosp-2027-v1' THEN
    RAISE EXCEPTION 'CIOSP public release preflight failed: approved price mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.prices p
    WHERE p.id = _legacy_price_id
      AND p.tenant_id = _tenant_id
      AND p.sellable_id = _sellable_id
      AND p.status = 'active'
      AND p.currency = 'BRL'
      AND p.unit_amount_minor = 999000
  ) THEN
    RAISE EXCEPTION 'CIOSP public release preflight failed: legacy price mismatch';
  END IF;

  PERFORM set_config('app.w09_control', 'on', true);

  UPDATE public.prices
     SET status = 'archived', updated_at = _now
   WHERE id = _legacy_price_id AND status = 'active';
  GET DIAGNOSTICS _affected = ROW_COUNT;
  IF _affected <> 1 THEN RAISE EXCEPTION 'CIOSP public release failed to archive legacy price'; END IF;

  UPDATE public.prices
     SET metadata = _approved_price_metadata || jsonb_build_object(
           'pricing_state', 'approved_public',
           'sales_public', true,
           'public_released_at', _now
         ),
         description = 'CIOSP Experience 2027 — R$ 12.490 por passageiro, acomodacao dupla. R$ 3.490 na contratacao + 3x R$ 3.000.',
         updated_at = _now
   WHERE id = _approved_price_id AND status = 'active';
  GET DIAGNOSTICS _affected = ROW_COUNT;
  IF _affected <> 1 THEN RAISE EXCEPTION 'CIOSP public release failed to publish approved price'; END IF;

  UPDATE public.sellables
     SET metadata = _sellable_metadata || jsonb_build_object(
           'pricing_state', 'approved_public',
           'sales_public', true,
           'public_released_at', _now
         ),
         updated_at = _now
   WHERE id = _sellable_id AND status = 'active';
  GET DIAGNOSTICS _affected = ROW_COUNT;
  IF _affected <> 1 THEN RAISE EXCEPTION 'CIOSP public release failed to publish sellable'; END IF;

  UPDATE public.offerings
     SET metadata = _offering_metadata || jsonb_build_object(
           'sales_public', true,
           'public_released_at', _now
         ),
         updated_at = _now
   WHERE id = _offering_id AND status = 'active';
  GET DIAGNOSTICS _affected = ROW_COUNT;
  IF _affected <> 1 THEN RAISE EXCEPTION 'CIOSP public release failed to publish offering'; END IF;

  PERFORM set_config('app.w09_control', 'off', true);

  PERFORM app_private.record_audit_event(
    _tenant_id,
    NULL,
    'commerce.ciosp_2027_public_sales_released',
    'offering',
    _offering_id,
    'ciosp-2027-public-release-v1',
    jsonb_build_object(
      'operation_id', _operation_id,
      'sellable_id', _sellable_id,
      'approved_price_id', _approved_price_id,
      'archived_legacy_price_id', _legacy_price_id,
      'unit_amount_minor', 1249000,
      'entry_minor', 349000,
      'commercial_terms_version', 'ciosp-2027-v1'
    )
  );
END $$;
