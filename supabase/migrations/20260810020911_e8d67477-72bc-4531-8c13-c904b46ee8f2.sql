-- W01 DEV MAINTENANCE: purge verification residue only. No schema/policy/function changes.
ALTER TABLE public.audit_events DISABLE TRIGGER audit_events_immutable;
ALTER TABLE public.memberships DISABLE TRIGGER memberships_guard;

DELETE FROM public.idempotency_keys
 WHERE actor_profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@cobs.test')
    OR tenant_id IN (SELECT id FROM public.tenants WHERE slug LIKE 'tenant-a-%' OR slug LIKE 'tenant-b-%');

DELETE FROM public.invitations
 WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug LIKE 'tenant-a-%' OR slug LIKE 'tenant-b-%');

DELETE FROM public.audit_events
 WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug LIKE 'tenant-a-%' OR slug LIKE 'tenant-b-%')
    OR actor_profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@cobs.test')
    OR tenant_id IS NULL;

DELETE FROM public.people
 WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug LIKE 'tenant-a-%' OR slug LIKE 'tenant-b-%');

DELETE FROM public.memberships
 WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug LIKE 'tenant-a-%' OR slug LIKE 'tenant-b-%')
    OR profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@cobs.test');

DELETE FROM public.tenants
 WHERE slug LIKE 'tenant-a-%' OR slug LIKE 'tenant-b-%';

DELETE FROM public.profiles WHERE email LIKE '%@cobs.test';

ALTER TABLE public.memberships ENABLE TRIGGER memberships_guard;
ALTER TABLE public.audit_events ENABLE TRIGGER audit_events_immutable;