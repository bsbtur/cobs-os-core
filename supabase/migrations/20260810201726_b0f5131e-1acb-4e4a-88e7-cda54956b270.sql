-- W08 HOTFIX BUG-W08-001: RLS policy helpers must be executable by the roles
-- evaluating the policies, exactly as app_private.has_tenant_role already is.
GRANT EXECUTE ON FUNCTION app_private.w08_is_comms_operator(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.w08_current_person_id(uuid) TO authenticated, service_role;