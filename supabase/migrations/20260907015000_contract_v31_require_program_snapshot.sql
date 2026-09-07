-- COBS OS · CIOSP-2027/V3.1 program snapshot requirement
-- Keeps V3.1 review-only while aligning template preflight with contract-snapshot-v2.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.contract_templates
    WHERE template_key = 'CIOSP-2027'
      AND version = 'V3.1'
      AND (status <> 'review_required' OR legal_reviewed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'CIOSP-2027/V3.1 must remain review_required and legally unreviewed before program schema amendment';
  END IF;
END
$$;

UPDATE public.contract_templates
SET
  variable_schema = jsonb_set(
    jsonb_set(
      COALESCE(variable_schema, '{}'::jsonb),
      '{required}',
      COALESCE(variable_schema->'required', '[]'::jsonb)
        || CASE
          WHEN COALESCE(variable_schema->'required', '[]'::jsonb) @> '["program_snapshot"]'::jsonb
            THEN '[]'::jsonb
          ELSE '["program_snapshot"]'::jsonb
        END
        || CASE
          WHEN COALESCE(variable_schema->'required', '[]'::jsonb) @> '["program_hash"]'::jsonb
            THEN '[]'::jsonb
          ELSE '["program_hash"]'::jsonb
        END,
      true
    ),
    '{schema_version}',
    '32'::jsonb,
    true
  ),
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'requires_program_snapshot', true,
    'program_snapshot_source', 'journey_steps',
    'program_snapshot_hash', 'sha256',
    'activation_guard', 'formal_legal_validation_required'
  ),
  updated_at = now()
WHERE template_key = 'CIOSP-2027'
  AND version = 'V3.1'
  AND status = 'review_required'
  AND legal_reviewed_at IS NULL;

COMMENT ON TABLE public.contract_templates IS
  'Contract templates remain activation-gated by formal legal review; CIOSP-2027/V3.1 requires supplier, privacy, commercial, payment and journey program snapshot evidence before generation.';
