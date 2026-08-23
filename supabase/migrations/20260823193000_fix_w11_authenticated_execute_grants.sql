-- PILOT-V1-OFFICIAL-01 hotfix
-- W11's hardening migration revoked PUBLIC/anon execute privileges, but did not
-- restore EXECUTE for authenticated operators. That makes valid planning and
-- runtime commands fail at the PostgREST/RPC boundary with a generic UI error.
--
-- Keep the functions SECURITY DEFINER and their internal tenant/role guards as
-- the authorization authority; this migration only restores the ability for an
-- authenticated session to invoke those guarded commands.

REVOKE ALL ON FUNCTION public.create_visit_point(uuid, text, text, text, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_visit_point(uuid, text, text, text, text, integer, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_visit_point(uuid, text, text, text, integer, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_visit_point(uuid, text, text, text, integer, boolean, boolean, boolean, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reorder_visit_points(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_visit_points(uuid, uuid[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_visit_point_event(uuid, public.visit_point_event_type, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_visit_point_event(uuid, public.visit_point_event_type, text, text, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_step_visit_points(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_step_visit_points(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.visit_point_runtime_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visit_point_runtime_state(uuid) TO authenticated, service_role;
