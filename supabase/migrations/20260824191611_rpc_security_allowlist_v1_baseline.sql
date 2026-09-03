-- COBS OS V1 - SECURITY DEFINER RPC allowlist baseline
-- 1) No anonymous execution of SECURITY DEFINER functions.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public','app_private')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
                   r.schema_name, r.function_name, r.identity_args);
  END LOOP;
END
$do$;

-- 2) app_private is internal by default. Only the four RLS helpers are callable by authenticated.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname = 'app_private'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
                   r.schema_name, r.function_name, r.identity_args);
  END LOOP;
END
$do$;

GRANT EXECUTE ON FUNCTION app_private.has_tenant_role(uuid, app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_tenant_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.w08_current_person_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.w08_is_comms_operator(uuid) TO authenticated;

-- 3) Persist the approved V1 baseline. This table is internal and deliberately not API-exposed.
CREATE TABLE IF NOT EXISTS app_private.rpc_security_allowlist_v1 (
  schema_name text NOT NULL,
  function_name text NOT NULL,
  identity_args text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('ALLOW','RESTRICT','SERVICE_ROLE','REMOVE')),
  expected_authenticated boolean NOT NULL,
  expected_anon boolean NOT NULL DEFAULT false,
  expected_service_role boolean,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schema_name, function_name, identity_args)
);

REVOKE ALL ON TABLE app_private.rpc_security_allowlist_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE app_private.rpc_security_allowlist_v1 TO service_role;

TRUNCATE app_private.rpc_security_allowlist_v1;

INSERT INTO app_private.rpc_security_allowlist_v1
(schema_name, function_name, identity_args, classification,
 expected_authenticated, expected_anon, expected_service_role)
SELECT
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  CASE
    WHEN n.nspname = 'public'
         AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND has_function_privilege('service_role', p.oid, 'EXECUTE')
         AND p.proname IN ('generate_due_staff_journey_alerts','record_provider_payment')
      THEN 'SERVICE_ROLE'
    WHEN n.nspname = 'public'
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      THEN 'ALLOW'
    WHEN n.nspname = 'app_private'
         AND p.proname IN ('has_tenant_role','is_tenant_member','w08_current_person_id','w08_is_comms_operator')
      THEN 'ALLOW'
    ELSE 'RESTRICT'
  END,
  CASE
    WHEN n.nspname = 'public' AND has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN true
    WHEN n.nspname = 'app_private' AND p.proname IN ('has_tenant_role','is_tenant_member','w08_current_person_id','w08_is_comms_operator') THEN true
    ELSE false
  END,
  false,
  CASE
    WHEN n.nspname = 'public' AND p.proname IN ('generate_due_staff_journey_alerts','record_provider_payment') THEN true
    ELSE NULL
  END
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname IN ('public','app_private');

-- 4) Assertion function for release/CI gates. SECURITY INVOKER on purpose.
CREATE OR REPLACE FUNCTION app_private.assert_rpc_security_allowlist_v1()
RETURNS TABLE(issue text, schema_name text, function_name text, identity_args text)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, app_private
AS $$
  WITH current_secdef AS (
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args,
           p.oid,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public','app_private')
  ), compared AS (
    SELECT
      CASE
        WHEN a.schema_name IS NULL THEN 'UNLISTED_SECURITY_DEFINER'
        WHEN c.schema_name IS NULL THEN 'ALLOWLIST_ENTRY_MISSING_FUNCTION'
        WHEN c.anon_exec IS DISTINCT FROM a.expected_anon THEN 'ANON_PRIVILEGE_DRIFT'
        WHEN c.auth_exec IS DISTINCT FROM a.expected_authenticated THEN 'AUTHENTICATED_PRIVILEGE_DRIFT'
        WHEN a.expected_service_role IS NOT NULL
             AND c.service_exec IS DISTINCT FROM a.expected_service_role THEN 'SERVICE_ROLE_PRIVILEGE_DRIFT'
        ELSE NULL
      END AS issue,
      coalesce(c.schema_name,a.schema_name) AS schema_name,
      coalesce(c.function_name,a.function_name) AS function_name,
      coalesce(c.identity_args,a.identity_args) AS identity_args
    FROM current_secdef c
    FULL OUTER JOIN app_private.rpc_security_allowlist_v1 a
      USING (schema_name,function_name,identity_args)
  )
  SELECT issue, schema_name, function_name, identity_args
  FROM compared
  WHERE issue IS NOT NULL
  ORDER BY issue, schema_name, function_name, identity_args;
$$;

REVOKE ALL ON FUNCTION app_private.assert_rpc_security_allowlist_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.assert_rpc_security_allowlist_v1() TO service_role;
