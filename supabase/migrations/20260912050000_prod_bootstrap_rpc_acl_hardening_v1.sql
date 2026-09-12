-- COBS OS · Production bootstrap RPC ACL hardening v1
--
-- Keeps the final RPC privileges aligned with the validated CLEAN BUILD contract.
-- This migration intentionally does not change function bodies or business data.
-- It removes accidental anonymous/service-role EXECUTE grants introduced by a
-- fresh project bootstrap/default ACL state.

DO $$
BEGIN
  IF to_regprocedure('public.activate_offering(uuid)') IS NULL
     OR to_regprocedure('public.activate_price(uuid)') IS NULL
     OR to_regprocedure('public.activate_sellable(uuid)') IS NULL
     OR to_regprocedure('public.assistant_create_conversation(uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.assistant_create_conversation(uuid,uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.assistant_submit_message(uuid,text,boolean,text)') IS NULL
     OR to_regprocedure('public.convert_commercial_lead_to_person(uuid)') IS NULL
     OR to_regprocedure('public.emit_initial_payment_pending_events(integer)') IS NULL
     OR to_regprocedure('public.publish_dynamic_operational_alert(uuid,text,text,text,text,uuid,text,public.message_priority)') IS NULL
     OR to_regprocedure('public.request_google_calendar_event_sync(uuid,text)') IS NULL
     OR to_regprocedure('public.set_event_schedule_precision(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Production RPC ACL hardening preflight failed: expected RPC surface is incomplete';
  END IF;
END
$$;

-- Governed authenticated RPCs. Match the validated CLEAN BUILD final ACL:
-- postgres + authenticated only.
REVOKE ALL ON FUNCTION public.activate_offering(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.activate_price(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.activate_sellable(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.assistant_create_conversation(uuid,text,text,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.assistant_create_conversation(uuid,uuid,text,text,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.assistant_submit_message(uuid,text,boolean,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.convert_commercial_lead_to_person(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.publish_dynamic_operational_alert(uuid,text,text,text,text,uuid,text,public.message_priority) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.request_google_calendar_event_sync(uuid,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.set_event_schedule_precision(uuid,text,text) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.activate_offering(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_price(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_sellable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_create_conversation(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_create_conversation(uuid,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_submit_message(uuid,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_commercial_lead_to_person(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_dynamic_operational_alert(uuid,text,text,text,text,uuid,text,public.message_priority) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_google_calendar_event_sync(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_schedule_precision(uuid,text,text) TO authenticated;

-- Internal bootstrap/reconciliation helper. Match CLEAN BUILD: postgres only.
REVOKE ALL ON FUNCTION public.emit_initial_payment_pending_events(integer)
  FROM PUBLIC, anon, authenticated, service_role;
