DO $$
BEGIN
  SET LOCAL session_replication_role = replica;

  DELETE FROM public.financial_facts;
  DELETE FROM public.commercial_reservations;
  DELETE FROM public.order_items;
  DELETE FROM public.orders;
  DELETE FROM public.prices;
  DELETE FROM public.sellables;

  DELETE FROM public.communication_events;
  DELETE FROM public.message_deliveries;
  DELETE FROM public.message_recipients;
  DELETE FROM public.message_audience_selectors;
  DELETE FROM public.messages;

  DELETE FROM public.event_runtime_events;
  DELETE FROM public.event_session_speakers;
  DELETE FROM public.event_staff_assignments;
  DELETE FROM public.event_sessions;
  DELETE FROM public.events;
  DELETE FROM public.venue_spaces;
  DELETE FROM public.venues;

  DELETE FROM public.hospitality_events;
  DELETE FROM public.hospitality_room_assignments;
  DELETE FROM public.hospitality_stay_participations;
  DELETE FROM public.hospitality_stays;
  DELETE FROM public.hospitality_rooms;
  DELETE FROM public.hospitality_properties;

  DELETE FROM public.transport_events;
  DELETE FROM public.transport_seat_assignments;
  DELETE FROM public.transport_leg_stops;
  DELETE FROM public.transport_legs;
  DELETE FROM public.drivers;
  DELETE FROM public.vehicles;

  DELETE FROM public.journey_events;
  DELETE FROM public.participant_presence_events;
  DELETE FROM public.playbook_executions;
  DELETE FROM public.playbook_items;
  DELETE FROM public.journey_steps;

  DELETE FROM public.operation_role_assignments;
  DELETE FROM public.operation_participations;
  DELETE FROM public.operation_role_types;
  DELETE FROM public.operations;
  DELETE FROM public.offerings;
  DELETE FROM public.experiences;

  DELETE FROM public.idempotency_keys;
  DELETE FROM public.audit_events;
  DELETE FROM public.invitations;
  DELETE FROM public.memberships;
  DELETE FROM public.people;
  DELETE FROM public.profiles;
  DELETE FROM public.tenants;

  DELETE FROM auth.identities;
  DELETE FROM auth.sessions;
  DELETE FROM auth.refresh_tokens;
  DELETE FROM auth.mfa_factors;
  DELETE FROM auth.one_time_tokens;
  DELETE FROM auth.users;

  SET LOCAL session_replication_role = origin;
END $$;