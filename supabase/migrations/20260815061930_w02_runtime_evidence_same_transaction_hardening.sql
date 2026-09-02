create or replace function app_private.w02_runtime_evidence(_operation_id uuid, _as_of timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog','public'
as $function$
  with cutoff as (select coalesce(_as_of, now()) as at),
  j as (
    select count(*)::int c from public.journey_events e, cutoff
    where e.operation_id = _operation_id
      and e.recorded_at <= cutoff.at
      and e.event_type in ('STEP_STARTED','STEP_COMPLETED','GATHERING_STARTED','BOARDING_STARTED',
                           'BOARDING_COMPLETED','DEPARTURE_AUTHORIZED','DEPARTED','ARRIVED',
                           'DISEMBARKATION_COMPLETED')
  ),
  p as (
    select count(*)::int c from public.participant_presence_events e, cutoff
    where e.operation_id = _operation_id
      and e.recorded_at <= cutoff.at
      and e.presence_fact in ('PRESENT_AT_MEETING_POINT','BOARDED','DISEMBARKED')
  ),
  t as (
    select count(*)::int c from public.transport_events e, cutoff
    where e.operation_id = _operation_id
      and e.recorded_at <= cutoff.at
      and e.event_type in ('VEHICLE_EN_ROUTE_TO_PICKUP','VEHICLE_AT_PICKUP','LEG_DEPARTED',
                           'STOP_REACHED','DESTINATION_ARRIVED')
  ),
  v as (
    select count(*)::int c from public.event_runtime_events e, cutoff
    where e.operation_id = _operation_id
      and e.recorded_at <= cutoff.at
      and e.event_type in ('EVENT_STARTED','EVENT_COMPLETED','SESSION_STARTED','SESSION_COMPLETED')
  )
  select jsonb_build_object(
    'journey', j.c, 'presence', p.c, 'transport', t.c, 'event_production', v.c,
    'total', j.c + p.c + t.c + v.c
  ) from j,p,t,v;
$function$;