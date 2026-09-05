-- =====================================================================
-- COBS OS · OPERATION WALL MVP · RPC ACL HARDENING
-- Supabase may apply explicit default EXECUTE grants to anon on newly
-- created public functions. Remove anon explicitly; traveler/organization
-- access requires an authenticated session and the W10/operator guards.
-- =====================================================================

revoke execute on function public.get_my_operation_wall(uuid) from anon;
revoke execute on function public.add_my_operation_wall_comment(uuid,text) from anon;
revoke execute on function public.toggle_my_operation_wall_reaction(uuid,text) from anon;
revoke execute on function public.vote_my_operation_wall_poll(uuid) from anon;
revoke execute on function public.create_operation_wall_post(uuid,text,text,jsonb) from anon;
