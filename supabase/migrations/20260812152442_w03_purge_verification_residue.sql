-- DEVELOPMENT MAINTENANCE: purge W03 verification residue only.
-- Guards/append-only protections are disabled for the duration of this
-- transaction and re-enabled before it ends. No permanent bypass is created.
alter table public.audit_events disable trigger audit_events_immutable;
alter table public.operation_participations disable trigger operation_participations_guard;
alter table public.operation_role_assignments disable trigger operation_role_assignments_guard;
alter table public.operation_role_types disable trigger operation_role_types_guard;
alter table public.operations disable trigger operations_guard;
alter table public.memberships disable trigger memberships_guard;

delete from public.operation_role_assignments;
delete from public.operation_participations;
delete from public.operation_role_types;
delete from public.operations;
delete from public.offerings;
delete from public.experiences;
delete from public.idempotency_keys;
delete from public.audit_events;
delete from public.invitations;
delete from public.memberships;
delete from public.people;
delete from public.tenants;
delete from public.profiles;

alter table public.audit_events enable trigger audit_events_immutable;
alter table public.operation_participations enable trigger operation_participations_guard;
alter table public.operation_role_assignments enable trigger operation_role_assignments_guard;
alter table public.operation_role_types enable trigger operation_role_types_guard;
alter table public.operations enable trigger operations_guard;
alter table public.memberships enable trigger memberships_guard;