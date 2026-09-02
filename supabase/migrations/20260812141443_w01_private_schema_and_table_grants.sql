GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_tenant_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_tenant_role(uuid, public.app_role[]) TO authenticated;

REVOKE ALL ON public.tenants, public.profiles, public.people, public.memberships, public.invitations, public.audit_events, public.idempotency_keys FROM anon;
REVOKE ALL ON public.tenants, public.profiles, public.people, public.memberships, public.invitations, public.audit_events, public.idempotency_keys FROM authenticated;

GRANT SELECT, UPDATE ON public.tenants TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.memberships TO authenticated;
GRANT SELECT, UPDATE ON public.invitations TO authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
GRANT SELECT ON public.idempotency_keys TO authenticated;

GRANT ALL ON public.tenants, public.profiles, public.people, public.memberships, public.invitations, public.audit_events, public.idempotency_keys TO service_role;