REVOKE ALL ON public.participant_access_grants FROM anon;
REVOKE ALL ON public.participant_access_invitations FROM anon;
REVOKE ALL ON public.participant_access_grants FROM authenticated;
REVOKE ALL ON public.participant_access_invitations FROM authenticated;
GRANT SELECT ON public.participant_access_grants TO authenticated;
GRANT SELECT ON public.participant_access_invitations TO authenticated;
GRANT ALL ON public.participant_access_grants TO service_role;
GRANT ALL ON public.participant_access_invitations TO service_role;
