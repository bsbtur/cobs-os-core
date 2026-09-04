create or replace function app_private.w09_incident_summary(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','public'
as $$
declare _journey int; _mobility int; _hospitality int; _events int:=0; _latest jsonb;
begin
  select count(*)::int into _journey from public.journey_events where operation_id=_operation_id and event_type='INCIDENT_NOTED';
  select count(*)::int into _mobility from public.transport_events where operation_id=_operation_id and event_type='TRANSPORT_INCIDENT_NOTED';
  select count(*)::int into _hospitality from public.hospitality_events where operation_id=_operation_id and event_type='HOSPITALITY_ISSUE_NOTED';

  with incidents as (
    select 'journey'::text domain,id,occurred_at,note from public.journey_events where operation_id=_operation_id and event_type='INCIDENT_NOTED'
    union all
    select 'mobility'::text domain,id,occurred_at,note from public.transport_events where operation_id=_operation_id and event_type='TRANSPORT_INCIDENT_NOTED'
    union all
    select 'hospitality'::text domain,id,occurred_at,note from public.hospitality_events where operation_id=_operation_id and event_type='HOSPITALITY_ISSUE_NOTED'
  ), limited as (
    select * from incidents order by occurred_at desc,id desc limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object('domain',domain,'id',id,'occurred_at',occurred_at,'note',note) order by occurred_at desc,id desc),'[]'::jsonb)
    into _latest from limited;

  return jsonb_build_object('total',_journey+_mobility+_hospitality+_events,'journey',_journey,'mobility',_mobility,'hospitality',_hospitality,'events',_events,'latest',_latest);
end $$;
revoke all on function app_private.w09_incident_summary(uuid) from public,anon,authenticated;