-- W02 hotfix: narrow grants to match the W01 least-privilege pattern.
-- No policy, trigger, function or schema semantics are changed.

revoke all on public.experiences from anon, authenticated;
revoke all on public.offerings   from anon, authenticated;
revoke all on public.operations  from anon, authenticated;

grant select, insert, update, delete on public.experiences to authenticated;
grant select, insert, update, delete on public.offerings   to authenticated;
grant select, insert, update          on public.operations  to authenticated;

grant all on public.experiences to service_role;
grant all on public.offerings   to service_role;
grant all on public.operations  to service_role;