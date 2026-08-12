-- Post-migration security hardening for the environment-managed RLS event trigger.
-- The event trigger runs internally as its postgres owner and does not require
-- direct API execution privileges for PUBLIC, anon, or authenticated.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is null then
    raise exception 'Expected function public.rls_auto_enable() was not found';
  end if;
end $$;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
