-- COBS OS · Contract V3.1 privacy policy identity pin
-- Binds the CIOSP 2027 contract template to one explicit traveler-contract privacy policy key.
-- Does not create or activate a privacy policy and does not mark the template legally reviewed.

do $$
begin
  if exists (
    select 1
    from public.contract_templates
    where template_key='CIOSP-2027'
      and version='V3.1'
      and (status <> 'review_required' or legal_reviewed_at is not null)
  ) then
    raise exception 'contract_v31_privacy_policy_key_requires_review_only_template';
  end if;
end;
$$;

update public.contract_templates
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
  'privacy_policy_key','ciosp-2027-traveler-contract',
  'privacy_policy_scope','traveler_contract',
  'privacy_policy_activation_guard','formal_legal_validation_required'
)
where template_key='CIOSP-2027'
  and version='V3.1'
  and status='review_required'
  and legal_reviewed_at is null;

-- Intentionally no insert/update on privacy_policy_versions.
-- The matching policy must be created, reviewed and activated in a separate controlled step.
