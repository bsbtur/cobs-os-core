-- COBS OS · CIOSP-2027/V3.1 program schema reconciliation
-- Reconciles QA/CLEAN BUILD with the intended V3.1 program snapshot contract.
-- Does not activate the template, record legal review, register document source, create contracts,
-- call Clicksign, or mutate payments.

do $$
begin
  if exists (
    select 1
    from public.contract_templates
    where template_key = 'CIOSP-2027'
      and version = 'V3.1'
      and (status <> 'review_required' or legal_reviewed_at is not null)
  ) then
    raise exception 'contract_v31_program_schema_reconcile_requires_review_only_template';
  end if;
end
$$;

update public.contract_templates
set
  variable_schema = jsonb_set(
    jsonb_set(
      coalesce(variable_schema, '{}'::jsonb),
      '{required}',
      (
        select jsonb_agg(value order by ord)
        from (
          select value, min(ord) ord
          from jsonb_array_elements(
            coalesce(variable_schema->'required', '[]'::jsonb)
            || '["program_snapshot","program_hash"]'::jsonb
          ) with ordinality as e(value, ord)
          group by value
        ) dedup
      ),
      true
    ),
    '{schema_version}',
    '32'::jsonb,
    true
  ),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'requires_program_snapshot', true,
    'program_snapshot_source', 'journey_steps',
    'program_snapshot_hash', 'sha256',
    'activation_guard', 'formal_legal_validation_required'
  ),
  updated_at = now()
where template_key = 'CIOSP-2027'
  and version = 'V3.1'
  and status = 'review_required'
  and legal_reviewed_at is null;

comment on table public.contract_templates is
  'Contract templates remain activation-gated by formal legal review; CIOSP-2027/V3.1 requires supplier, privacy, commercial, payment and journey program snapshot evidence before generation.';
