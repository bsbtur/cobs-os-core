-- COBS OS · M5 Phase H — behavioural verification on the RESTORED copy.
-- Proves the restore reproduces *enforced behaviour*, not just catalog shape.
\set ON_ERROR_STOP off
\pset pager off

\echo '== H1: anonymous role cannot read tenant data (RLS deny)'
set role anon;
select 'H1 tenants rows visible to anon = '||count(*)::text from public.tenants;
select 'H1 people rows visible to anon = '||count(*)::text from public.people;
reset role;

\echo '== H2: authenticated with NO jwt claims sees nothing'
set role authenticated;
select set_config('request.jwt.claims', NULL, false);
select 'H2 tenants visible = '||count(*)::text from public.tenants;
select 'H2 memberships visible = '||count(*)::text from public.memberships;
reset role;

\echo '== H3: authenticated as the real restored member sees exactly own tenant'
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"38c4f5d6-371f-4d7e-a7ee-3cd8719d5e52","role":"authenticated"}', false);
select 'H3 tenants visible = '||count(*)::text from public.tenants;
select 'H3 memberships visible = '||count(*)::text from public.memberships;
select 'H3 people visible = '||count(*)::text from public.people;
reset role;

\echo '== H4: authenticated as a FOREIGN uid sees zero rows (tenant isolation)'
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', false);
select 'H4 tenants visible = '||count(*)::text from public.tenants;
select 'H4 people visible = '||count(*)::text from public.people;
reset role;

\echo '== H5: direct table mutation is refused for authenticated (SELECT-only ACL)'
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"38c4f5d6-371f-4d7e-a7ee-3cd8719d5e52","role":"authenticated"}', false);
insert into public.tenants (name, slug) values ('drill', 'drill');
update public.people set full_name = 'x';
delete from public.audit_events;
reset role;

\echo '== H6: app_private helper schema is not reachable by authenticated'
set role authenticated;
select app_private.current_profile_id();
reset role;

\echo '== H7a: SECURITY DEFINER command surface rejects unauthenticated callers'
set role authenticated;
select set_config('request.jwt.claims', '', false);
select public.create_experience('9a09c18f-1279-4196-ad4d-929e93e348f2'::uuid, 'DRILL', 'drill-restore', 'tourism', null, null, null, null, null, null, null, null, null);
reset role;

\echo '== H7b: SD command surface rejects a FOREIGN authenticated caller'
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', false);
select public.create_experience('9a09c18f-1279-4196-ad4d-929e93e348f2'::uuid, 'DRILL', 'drill-restore-2', 'tourism', null, null, null, null, null, null, null, null, null);
reset role;
select set_config('request.jwt.claims', '', false);

\echo '== H8: audit/event tables remain append-only under the restored triggers'
set role postgres;
update public.audit_events set action = 'tampered';
reset role;

\echo '== H9: restored SECURITY DEFINER count matches the frozen surface'
select 'H9 public functions = '||count(*)::text from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select 'H9 secdef public functions = '||count(*)::text from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef;
select 'H9 tables with RLS enabled = '||count(*)::text from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity;
select 'H9 tables WITHOUT RLS = '||coalesce(string_agg(c.relname,','),'none') from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
