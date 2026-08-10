-- One-shot maintenance cleanup of W05 verification residue.
-- Guards are suspended only for this transaction via session_replication_role
-- and restored before completion. No permanent maintenance surface is created.
set local session_replication_role = replica;

delete from public.transport_seat_assignments;
delete from public.transport_events;
delete from public.transport_leg_stops;
delete from public.transport_legs;
delete from public.drivers;
delete from public.vehicles;
delete from public.playbook_executions;
delete from public.playbook_items;
delete from public.participant_presence_events;
delete from public.journey_events;
delete from public.journey_steps;
delete from public.operation_role_assignments;
delete from public.operation_participations;
delete from public.operation_role_types;
delete from public.operations;
delete from public.offerings;
delete from public.experiences;
delete from public.people;
delete from public.invitations;
delete from public.memberships;
delete from public.idempotency_keys;
delete from public.audit_events;
delete from public.tenants;
delete from public.profiles where email like '%@verify.invalid' or email is null;
delete from auth.users where email like '%@verify.invalid';

set local session_replication_role = origin;
