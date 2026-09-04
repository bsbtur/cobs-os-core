-- W02 DEVELOPMENT MAINTENANCE: one-shot removal of verification residue.
-- No schema, policy, grant, function or trigger definition is altered.
do $$
declare
  _test_profiles uuid[];
  _test_tenants uuid[];
begin
  select coalesce(array_agg(u.id), '{}') into _test_profiles
    from auth.users u where u.email like '%@w02test.local';

  select coalesce(array_agg(t.id), '{}') into _test_tenants
    from public.tenants t where t.slug like 'w02v%';

  -- Business rows (W02)
  delete from public.operations  where tenant_id = any(_test_tenants);
  delete from public.offerings   where tenant_id = any(_test_tenants);
  delete from public.experiences where tenant_id = any(_test_tenants);

  -- Identity rows (W01)
  delete from public.invitations      where tenant_id = any(_test_tenants);
  delete from public.idempotency_keys where tenant_id = any(_test_tenants)
                                         or actor_profile_id = any(_test_profiles);
  delete from public.people           where tenant_id = any(_test_tenants);

  alter table public.memberships disable trigger memberships_guard;
  delete from public.memberships where tenant_id = any(_test_tenants);
  alter table public.memberships enable trigger memberships_guard;

  -- Append-only audit: temporary maintenance bypass, restored immediately.
  alter table public.audit_events disable trigger audit_events_immutable;
  delete from public.audit_events where tenant_id = any(_test_tenants)
                                     or actor_profile_id = any(_test_profiles);
  alter table public.audit_events enable trigger audit_events_immutable;

  delete from public.tenants  where id = any(_test_tenants);
  delete from public.profiles where id = any(_test_profiles);
  delete from auth.users      where id = any(_test_profiles);
end;
$$;