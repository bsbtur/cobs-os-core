DO $$
DECLARE
  v_tenants uuid[];
BEGIN
  SELECT array_agg(id) INTO v_tenants FROM public.tenants
   WHERE slug LIKE 'w06ver-%' OR name LIKE 'VERIFY W06%';

  IF v_tenants IS NULL THEN
    RAISE NOTICE 'no verification tenants found';
    RETURN;
  END IF;

  ALTER TABLE public.hospitality_events DISABLE TRIGGER USER;
  ALTER TABLE public.hospitality_room_assignments DISABLE TRIGGER USER;
  ALTER TABLE public.hospitality_stay_participations DISABLE TRIGGER USER;
  ALTER TABLE public.hospitality_rooms DISABLE TRIGGER USER;
  ALTER TABLE public.hospitality_stays DISABLE TRIGGER USER;
  ALTER TABLE public.hospitality_properties DISABLE TRIGGER USER;
  ALTER TABLE public.transport_events DISABLE TRIGGER USER;
  ALTER TABLE public.transport_seat_assignments DISABLE TRIGGER USER;
  ALTER TABLE public.transport_leg_stops DISABLE TRIGGER USER;
  ALTER TABLE public.transport_legs DISABLE TRIGGER USER;
  ALTER TABLE public.drivers DISABLE TRIGGER USER;
  ALTER TABLE public.vehicles DISABLE TRIGGER USER;
  ALTER TABLE public.playbook_executions DISABLE TRIGGER USER;
  ALTER TABLE public.playbook_items DISABLE TRIGGER USER;
  ALTER TABLE public.participant_presence_events DISABLE TRIGGER USER;
  ALTER TABLE public.journey_events DISABLE TRIGGER USER;
  ALTER TABLE public.journey_steps DISABLE TRIGGER USER;
  ALTER TABLE public.operation_role_assignments DISABLE TRIGGER USER;
  ALTER TABLE public.operation_participations DISABLE TRIGGER USER;
  ALTER TABLE public.operation_role_types DISABLE TRIGGER USER;
  ALTER TABLE public.operations DISABLE TRIGGER USER;
  ALTER TABLE public.offerings DISABLE TRIGGER USER;
  ALTER TABLE public.experiences DISABLE TRIGGER USER;
  ALTER TABLE public.invitations DISABLE TRIGGER USER;
  ALTER TABLE public.memberships DISABLE TRIGGER USER;
  ALTER TABLE public.people DISABLE TRIGGER USER;
  ALTER TABLE public.idempotency_keys DISABLE TRIGGER USER;
  ALTER TABLE public.audit_events DISABLE TRIGGER USER;
  ALTER TABLE public.tenants DISABLE TRIGGER USER;

  DELETE FROM public.hospitality_events WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.hospitality_room_assignments WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.hospitality_stay_participations WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.hospitality_rooms WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.hospitality_stays WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.hospitality_properties WHERE tenant_id = ANY(v_tenants);

  DELETE FROM public.transport_events WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.transport_seat_assignments WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.transport_leg_stops WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.transport_legs WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.drivers WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.vehicles WHERE tenant_id = ANY(v_tenants);

  DELETE FROM public.playbook_executions WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.playbook_items WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.participant_presence_events WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.journey_events WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.journey_steps WHERE tenant_id = ANY(v_tenants);

  DELETE FROM public.operation_role_assignments WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.operation_participations WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.operation_role_types WHERE tenant_id = ANY(v_tenants);

  DELETE FROM public.operations WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.offerings WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.experiences WHERE tenant_id = ANY(v_tenants);

  DELETE FROM public.invitations WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.memberships WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.people WHERE tenant_id = ANY(v_tenants);
  DELETE FROM public.idempotency_keys WHERE tenant_id = ANY(v_tenants) OR tenant_id IS NULL;
  DELETE FROM public.audit_events WHERE tenant_id = ANY(v_tenants) OR tenant_id IS NULL;
  DELETE FROM public.tenants WHERE id = ANY(v_tenants);

  ALTER TABLE public.hospitality_events ENABLE TRIGGER USER;
  ALTER TABLE public.hospitality_room_assignments ENABLE TRIGGER USER;
  ALTER TABLE public.hospitality_stay_participations ENABLE TRIGGER USER;
  ALTER TABLE public.hospitality_rooms ENABLE TRIGGER USER;
  ALTER TABLE public.hospitality_stays ENABLE TRIGGER USER;
  ALTER TABLE public.hospitality_properties ENABLE TRIGGER USER;
  ALTER TABLE public.transport_events ENABLE TRIGGER USER;
  ALTER TABLE public.transport_seat_assignments ENABLE TRIGGER USER;
  ALTER TABLE public.transport_leg_stops ENABLE TRIGGER USER;
  ALTER TABLE public.transport_legs ENABLE TRIGGER USER;
  ALTER TABLE public.drivers ENABLE TRIGGER USER;
  ALTER TABLE public.vehicles ENABLE TRIGGER USER;
  ALTER TABLE public.playbook_executions ENABLE TRIGGER USER;
  ALTER TABLE public.playbook_items ENABLE TRIGGER USER;
  ALTER TABLE public.participant_presence_events ENABLE TRIGGER USER;
  ALTER TABLE public.journey_events ENABLE TRIGGER USER;
  ALTER TABLE public.journey_steps ENABLE TRIGGER USER;
  ALTER TABLE public.operation_role_assignments ENABLE TRIGGER USER;
  ALTER TABLE public.operation_participations ENABLE TRIGGER USER;
  ALTER TABLE public.operation_role_types ENABLE TRIGGER USER;
  ALTER TABLE public.operations ENABLE TRIGGER USER;
  ALTER TABLE public.offerings ENABLE TRIGGER USER;
  ALTER TABLE public.experiences ENABLE TRIGGER USER;
  ALTER TABLE public.invitations ENABLE TRIGGER USER;
  ALTER TABLE public.memberships ENABLE TRIGGER USER;
  ALTER TABLE public.people ENABLE TRIGGER USER;
  ALTER TABLE public.idempotency_keys ENABLE TRIGGER USER;
  ALTER TABLE public.audit_events ENABLE TRIGGER USER;
  ALTER TABLE public.tenants ENABLE TRIGGER USER;
END $$;