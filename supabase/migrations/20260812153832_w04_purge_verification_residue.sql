-- ============================================================
-- W04 CLEANUP (DEVELOPMENT MAINTENANCE, ONE-SHOT)
-- Removes verification residue only. No schema/RLS/grant/function change.
-- Append-only guards are disabled ONLY inside this transaction and
-- restored before completion. No permanent cleanup RPC is created.
-- ============================================================

-- 1. Pause guards (W04 runtime, W03 roster, W02 lifecycle, W01 audit)
ALTER TABLE public.audit_events                DISABLE TRIGGER audit_events_immutable;
ALTER TABLE public.journey_events              DISABLE TRIGGER journey_events_append_only;
ALTER TABLE public.journey_events              DISABLE TRIGGER journey_events_guard;
ALTER TABLE public.journey_steps               DISABLE TRIGGER journey_steps_baseline;
ALTER TABLE public.journey_steps               DISABLE TRIGGER journey_steps_guard;
ALTER TABLE public.participant_presence_events DISABLE TRIGGER presence_append_only;
ALTER TABLE public.participant_presence_events DISABLE TRIGGER presence_guard;
ALTER TABLE public.playbook_executions         DISABLE TRIGGER playbook_exec_append_only;
ALTER TABLE public.playbook_executions         DISABLE TRIGGER playbook_exec_guard;
ALTER TABLE public.playbook_items              DISABLE TRIGGER playbook_items_guard;
ALTER TABLE public.operation_participations    DISABLE TRIGGER operation_participations_guard;
ALTER TABLE public.operation_role_assignments  DISABLE TRIGGER operation_role_assignments_guard;
ALTER TABLE public.operation_role_types        DISABLE TRIGGER operation_role_types_guard;
ALTER TABLE public.operations                  DISABLE TRIGGER operations_guard;
ALTER TABLE public.operations                  DISABLE TRIGGER operations_guard_insert;
ALTER TABLE public.experiences                 DISABLE TRIGGER experiences_audit;
ALTER TABLE public.offerings                   DISABLE TRIGGER offerings_audit;
ALTER TABLE public.memberships                 DISABLE TRIGGER memberships_guard;

-- 2. Delete verification data (child -> parent).
--    All existing tenants are W04 verification tenants ("W04 Verify %"),
--    and all auth users are @cobs.test verification accounts.
DELETE FROM public.playbook_executions;
DELETE FROM public.participant_presence_events;
DELETE FROM public.journey_events;
DELETE FROM public.playbook_items;
DELETE FROM public.journey_steps;
DELETE FROM public.operation_role_assignments;
DELETE FROM public.operation_participations;
DELETE FROM public.operation_role_types;
DELETE FROM public.operations;
DELETE FROM public.offerings;
DELETE FROM public.experiences;
DELETE FROM public.people;
DELETE FROM public.invitations;
DELETE FROM public.memberships;
DELETE FROM public.idempotency_keys;
DELETE FROM public.audit_events;
DELETE FROM public.tenants;
DELETE FROM public.profiles;
DELETE FROM auth.users WHERE email LIKE '%@cobs.test';

-- 3. Restore guards
ALTER TABLE public.audit_events                ENABLE TRIGGER audit_events_immutable;
ALTER TABLE public.journey_events              ENABLE TRIGGER journey_events_append_only;
ALTER TABLE public.journey_events              ENABLE TRIGGER journey_events_guard;
ALTER TABLE public.journey_steps               ENABLE TRIGGER journey_steps_baseline;
ALTER TABLE public.journey_steps               ENABLE TRIGGER journey_steps_guard;
ALTER TABLE public.participant_presence_events ENABLE TRIGGER presence_append_only;
ALTER TABLE public.participant_presence_events ENABLE TRIGGER presence_guard;
ALTER TABLE public.playbook_executions         ENABLE TRIGGER playbook_exec_append_only;
ALTER TABLE public.playbook_executions         ENABLE TRIGGER playbook_exec_guard;
ALTER TABLE public.playbook_items              ENABLE TRIGGER playbook_items_guard;
ALTER TABLE public.operation_participations    ENABLE TRIGGER operation_participations_guard;
ALTER TABLE public.operation_role_assignments  ENABLE TRIGGER operation_role_assignments_guard;
ALTER TABLE public.operation_role_types        ENABLE TRIGGER operation_role_types_guard;
ALTER TABLE public.operations                  ENABLE TRIGGER operations_guard;
ALTER TABLE public.operations                  ENABLE TRIGGER operations_guard_insert;
ALTER TABLE public.experiences                 ENABLE TRIGGER experiences_audit;
ALTER TABLE public.offerings                   ENABLE TRIGGER offerings_audit;
ALTER TABLE public.memberships                 ENABLE TRIGGER memberships_guard;