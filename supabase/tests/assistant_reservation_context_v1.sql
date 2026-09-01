-- Static SQL contract for Assistant Reservation Context V1.
-- Runtime E2E is executed with an authenticated pure-traveler session.

select
  to_regprocedure('app_private.assistant_build_reservation_context(uuid,uuid,uuid)') is not null
    as reservation_context_helper_exists,
  to_regprocedure('public.assistant_submit_message(uuid,text,boolean,text)') is not null
    as assistant_submit_message_exists;
