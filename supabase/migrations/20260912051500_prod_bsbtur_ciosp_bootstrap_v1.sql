-- COBS OS · BSBTUR + CIOSP 2027 production bootstrap v1
--
-- Purpose: seed the minimum real commercial base into a brand-new production
-- database without copying QA identities, orders, payments, fixtures or UUIDs.
--
-- Safety:
-- - runs only when the business database is still empty;
-- - generates fresh UUIDs at runtime;
-- - public sales remain CLOSED (sales_public=false);
-- - creates no auth user, person, order, payment attempt, charge or financial fact;
-- - uses the approved commerce/operation mutation guards explicitly.

DO $$
DECLARE
  _tenant_id uuid;
  _experience_id uuid;
  _offering_id uuid;
  _sellable_id uuid;
  _operation_id uuid;
BEGIN
  -- Shared migrations must remain harmless in QA/STAGING or any populated env.
  IF EXISTS (SELECT 1 FROM public.tenants)
     OR EXISTS (SELECT 1 FROM public.operations) THEN
    RETURN;
  END IF;

  PERFORM set_config('app.w09_control', 'on', true);
  PERFORM set_config('app.op_control', 'on', true);

  INSERT INTO public.tenants (
    slug,
    name,
    country_code,
    default_locale,
    timezone,
    currency_code
  ) VALUES (
    'bsbtur',
    'BSBTUR LTDA',
    'BR',
    'pt-BR',
    'America/Sao_Paulo',
    'BRL'
  )
  RETURNING id INTO _tenant_id;

  INSERT INTO public.experiences (
    tenant_id,
    name,
    slug,
    short_description,
    description,
    experience_kind,
    category_tags,
    status,
    default_locale,
    default_timezone,
    country_code,
    region,
    city,
    metadata
  ) VALUES (
    _tenant_id,
    'CIOSP 2027 — Caravana BSBTUR',
    'ciosp-2027-caravana-bsbtur',
    'Caravana acadêmica BSBTUR para o 44º CIOSP 2027 em São Paulo.',
    'Produto comercial CIOSP 2027. Planejamento de 30 passageiros pagantes. Viagem prevista de 25/01/2027 a 31/01/2027.',
    'hybrid',
    ARRAY['CIOSP','odontologia','turismo acadêmico','caravana'],
    'draft',
    'pt-BR',
    'America/Sao_Paulo',
    'BR',
    'SP',
    'São Paulo',
    jsonb_build_object(
      'event_start','2027-01-27',
      'event_end','2027-01-30',
      'planned_trip_start','2027-01-25',
      'planned_trip_end','2027-01-31',
      'commercial_release','v1',
      'pricing_state','approved_private',
      'sales_public',false,
      'qa_fixture',false
    )
  )
  RETURNING id INTO _experience_id;

  INSERT INTO public.offerings (
    tenant_id,
    experience_id,
    name,
    slug,
    status,
    available_from,
    available_until,
    sales_start,
    sales_end,
    capacity,
    currency_code,
    metadata
  ) VALUES (
    _tenant_id,
    _experience_id,
    'Caravana Completa CIOSP 2027',
    'caravana-completa-ciosp-2027',
    'active',
    '2027-01-25T00:00:00-03:00'::timestamptz,
    '2027-01-31T23:59:59-03:00'::timestamptz,
    NULL,
    '2027-01-10T23:59:59-03:00'::timestamptz,
    30,
    'BRL',
    jsonb_build_object(
      'entry_minor',349000,
      'balance_minor',900000,
      'balance_due_date','2027-01-10',
      'max_paying_passengers',30,
      'viability_gate_payers',20,
      'target_unit_price_minor',1249000,
      'payment_installment_count',4,
      'commercial_release','v1',
      'commercial_terms_version','ciosp-2027-v1',
      'commercial_terms_approved_at','2026-09-03T21:54:00-03:00',
      'pricing_state','approved_private',
      'sales_public',false,
      'payment_schedule_v1',jsonb_build_array(
        jsonb_build_object('kind','entry','due_rule','at_contract','amount_minor',349000,'installment_number',1),
        jsonb_build_object('kind','installment','due_date','2026-10-10','amount_minor',300000,'installment_number',2),
        jsonb_build_object('kind','installment','due_date','2026-11-10','amount_minor',300000,'installment_number',3),
        jsonb_build_object('kind','installment','due_date','2026-12-10','amount_minor',300000,'installment_number',4)
      )
    )
  )
  RETURNING id INTO _offering_id;

  INSERT INTO public.sellables (
    tenant_id,
    sellable_kind,
    offering_id,
    name,
    description,
    status,
    metadata
  ) VALUES (
    _tenant_id,
    'offering',
    _offering_id,
    'CIOSP Experience 2027',
    'Pacote comercial CIOSP 2027 — R$ 12.490 por passageiro, acomodação dupla.',
    'active',
    jsonb_build_object(
      'commercial_release','v1',
      'commercial_terms_version','ciosp-2027-v1',
      'pricing_state','approved_private',
      'sales_public',false
    )
  )
  RETURNING id INTO _sellable_id;

  INSERT INTO public.prices (
    tenant_id,
    sellable_id,
    currency,
    unit_amount_minor,
    price_basis,
    description,
    status,
    valid_from,
    valid_until,
    metadata
  ) VALUES (
    _tenant_id,
    _sellable_id,
    'BRL',
    1249000,
    'per_person',
    'CIOSP Experience 2027 — R$ 12.490 por passageiro, acomodação dupla. R$ 3.490 na contratação + 3x R$ 3.000.',
    'active',
    '2026-09-03T21:54:00-03:00'::timestamptz,
    NULL,
    jsonb_build_object(
      'commercial_terms_version','ciosp-2027-v1',
      'pricing_state','approved_private',
      'sales_public',false
    )
  );

  INSERT INTO public.operations (
    tenant_id,
    experience_id,
    offering_id,
    name,
    code,
    operation_kind,
    status,
    primary_country,
    primary_region,
    primary_city,
    timezone,
    planned_start,
    planned_end,
    source_experience_name,
    source_offering_name,
    metadata
  ) VALUES (
    _tenant_id,
    _experience_id,
    _offering_id,
    'Caravana CIOSP — São Paulo',
    'CIOSP-SP-2027',
    'tourism',
    'planning',
    'BR',
    'SP',
    'São Paulo',
    'America/Sao_Paulo',
    '2027-01-25T07:00:00-03:00'::timestamptz,
    '2027-01-31T20:00:00-03:00'::timestamptz,
    'CIOSP 2027 — Caravana BSBTUR',
    'Caravana Completa CIOSP 2027',
    jsonb_build_object(
      'release_gate','CIOSP_2027',
      'commercial_release','v1',
      'commercial_terms_version','ciosp-2027-v1',
      'commercial_price_minor',1249000,
      'sales_public',false,
      'production_bootstrap',true
    )
  )
  RETURNING id INTO _operation_id;

  -- Postconditions: minimum real catalog exists and public checkout remains closed.
  IF (SELECT count(*) FROM public.tenants WHERE id = _tenant_id AND slug = 'bsbtur') <> 1 THEN
    RAISE EXCEPTION 'BSBTUR production bootstrap failed: tenant missing';
  END IF;

  IF (SELECT count(*) FROM public.operations WHERE id = _operation_id AND code = 'CIOSP-SP-2027' AND archived_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'CIOSP production bootstrap failed: operation missing';
  END IF;

  IF coalesce((SELECT (metadata->>'sales_public')::boolean FROM public.offerings WHERE id = _offering_id), false)
     OR coalesce((SELECT (metadata->>'sales_public')::boolean FROM public.sellables WHERE id = _sellable_id), false)
     OR coalesce((SELECT (metadata->>'sales_public')::boolean FROM public.prices WHERE sellable_id = _sellable_id ORDER BY created_at DESC LIMIT 1), false) THEN
    RAISE EXCEPTION 'CIOSP production bootstrap failed: public sales must remain closed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders)
     OR EXISTS (SELECT 1 FROM public.payment_charges)
     OR EXISTS (SELECT 1 FROM public.payment_attempts)
     OR EXISTS (SELECT 1 FROM public.financial_facts) THEN
    RAISE EXCEPTION 'CIOSP production bootstrap failed: transactional data must remain empty';
  END IF;
END
$$;
