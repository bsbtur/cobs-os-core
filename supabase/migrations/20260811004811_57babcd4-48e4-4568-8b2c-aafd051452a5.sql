DROP INDEX IF EXISTS public.presence_fact_once;
CREATE UNIQUE INDEX presence_fact_once
  ON public.participant_presence_events (
    participation_id,
    COALESCE(journey_step_id, '00000000-0000-0000-0000-000000000000'::uuid),
    presence_fact,
    COALESCE(supersedes_presence_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE presence_fact <> 'PRESENCE_RETRACTED';