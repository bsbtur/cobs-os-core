-- COBS OS V1 · post-baseline SECURITY DEFINER allowlist hardening
-- Scope is intentionally narrow: register the 64 audited post-baseline functions
-- and remove direct EXECUTE from four internal trigger functions.
-- No business logic, RLS policy, payment flow or application behavior is changed.

DO $do$
DECLARE
  v_unlisted integer;
  v_anon_unlisted integer;
BEGIN
  SELECT count(*) INTO v_unlisted
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  LEFT JOIN app_private.rpc_security_allowlist_v1 a
    ON a.schema_name=n.nspname
   AND a.function_name=p.proname
   AND a.identity_args=pg_get_function_identity_arguments(p.oid)
  WHERE p.prosecdef
    AND n.nspname IN ('public','app_private')
    AND a.schema_name IS NULL;

  IF v_unlisted <> 64 THEN
    RAISE EXCEPTION 'rpc_allowlist_expected_64_unlisted_found_%', v_unlisted;
  END IF;

  SELECT count(*) INTO v_anon_unlisted
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  LEFT JOIN app_private.rpc_security_allowlist_v1 a
    ON a.schema_name=n.nspname
   AND a.function_name=p.proname
   AND a.identity_args=pg_get_function_identity_arguments(p.oid)
  WHERE p.prosecdef
    AND n.nspname IN ('public','app_private')
    AND a.schema_name IS NULL
    AND has_function_privilege('anon',p.oid,'EXECUTE');

  IF v_anon_unlisted <> 4 THEN
    RAISE EXCEPTION 'rpc_allowlist_expected_4_anon_unlisted_found_%', v_anon_unlisted;
  END IF;
END
$do$;

-- These are trigger functions, not client RPCs. Trigger execution does not require
-- API roles to hold direct EXECUTE on the trigger function.
REVOKE ALL ON FUNCTION app_private.assistant_capture_automation_result() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.ciosp_apply_commercial_entry_charge() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.guard_customer_contract_production_environment() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.guard_privacy_policy_activation_evidence() FROM PUBLIC, anon, authenticated, service_role;

-- Persist only the currently unlisted, audited surface. Existing baseline rows are untouched.
INSERT INTO app_private.rpc_security_allowlist_v1
(schema_name,function_name,identity_args,classification,
 expected_authenticated,expected_anon,expected_service_role,captured_at)
SELECT
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  CASE
    WHEN n.nspname='app_private'
         AND p.proname IN ('assistant_can_access_conversation','assistant_has_operation_access')
      THEN 'ALLOW'
    WHEN n.nspname='app_private' THEN 'RESTRICT'
    WHEN has_function_privilege('authenticated',p.oid,'EXECUTE') THEN 'ALLOW'
    WHEN has_function_privilege('service_role',p.oid,'EXECUTE') THEN 'SERVICE_ROLE'
    ELSE 'RESTRICT'
  END,
  has_function_privilege('authenticated',p.oid,'EXECUTE'),
  false,
  CASE
    WHEN n.nspname='public' AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      THEN has_function_privilege('service_role',p.oid,'EXECUTE')
    WHEN n.nspname='app_private' THEN has_function_privilege('service_role',p.oid,'EXECUTE')
    ELSE NULL
  END,
  now()
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
LEFT JOIN app_private.rpc_security_allowlist_v1 a
  ON a.schema_name=n.nspname
 AND a.function_name=p.proname
 AND a.identity_args=pg_get_function_identity_arguments(p.oid)
WHERE p.prosecdef
  AND n.nspname IN ('public','app_private')
  AND a.schema_name IS NULL;

-- Release gate: migration must not succeed with any remaining allowlist/ACL drift.
DO $do$
DECLARE v_issues integer;
BEGIN
  SELECT count(*) INTO v_issues FROM app_private.assert_rpc_security_allowlist_v1();
  IF v_issues <> 0 THEN
    RAISE EXCEPTION 'rpc_security_allowlist_gate_failed_with_%_issues', v_issues;
  END IF;
END
$do$;
