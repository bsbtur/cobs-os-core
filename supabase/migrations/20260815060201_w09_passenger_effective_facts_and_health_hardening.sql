create or replace function app_private.w09_passenger_summary(_operation_id uuid, _current_step_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','public'
as $$
declare
  _total int; _expected int; _confirmed int; _cancelled int;
  _evaluated int := 0; _present int := 0; _boarded int := 0; _disembarked int := 0;
  _absent int := 0; _no_show int := 0; _unresolved int := 0;
  _ef_present int:=0; _ef_boarded int:=0; _ef_disembarked int:=0; _ef_absent int:=0; _ef_no_show int:=0;
begin
  select count(*)::int,
         count(*) filter (where status='expected')::int,
         count(*) filter (where status='confirmed')::int,
         count(*) filter (where status='cancelled')::int
    into _total,_expected,_confirmed,_cancelled
    from public.operation_participations
   where operation_id=_operation_id;

  if _current_step_id is not null then
    with pop as (
      select p.id from public.operation_participations p
       where p.operation_id=_operation_id and p.status='confirmed' and p.participation_kind='participant'
    ), latest as (
      select distinct on (ev.participation_id) ev.participation_id,ev.presence_fact
        from public.participant_presence_events ev
       where ev.journey_step_id=_current_step_id
         and ev.presence_fact <> 'PRESENCE_RETRACTED'
         and not exists (select 1 from public.participant_presence_events r where r.retracts_presence_event_id=ev.id)
       order by ev.participation_id,ev.occurred_at desc,ev.recorded_at desc,ev.id desc
    )
    select count(*)::int,
           count(*) filter (where l.presence_fact='PRESENT_AT_MEETING_POINT')::int,
           count(*) filter (where l.presence_fact='BOARDED')::int,
           count(*) filter (where l.presence_fact='DISEMBARKED')::int,
           count(*) filter (where l.presence_fact='ABSENCE_NOTED')::int,
           count(*) filter (where l.presence_fact='NO_SHOW_CONFIRMED')::int,
           count(*) filter (where l.presence_fact is null or l.presence_fact='ABSENCE_NOTED')::int
      into _evaluated,_present,_boarded,_disembarked,_absent,_no_show,_unresolved
      from pop left join latest l on l.participation_id=pop.id;
  end if;

  with latest_effective as (
    select distinct on (ev.participation_id,ev.journey_step_id)
           ev.participation_id,ev.journey_step_id,ev.presence_fact
      from public.participant_presence_events ev
     where ev.operation_id=_operation_id
       and ev.presence_fact <> 'PRESENCE_RETRACTED'
       and not exists (select 1 from public.participant_presence_events r where r.retracts_presence_event_id=ev.id)
     order by ev.participation_id,ev.journey_step_id,ev.occurred_at desc,ev.recorded_at desc,ev.id desc
  )
  select count(*) filter(where presence_fact='PRESENT_AT_MEETING_POINT')::int,
         count(*) filter(where presence_fact='BOARDED')::int,
         count(*) filter(where presence_fact='DISEMBARKED')::int,
         count(*) filter(where presence_fact='ABSENCE_NOTED')::int,
         count(*) filter(where presence_fact='NO_SHOW_CONFIRMED')::int
    into _ef_present,_ef_boarded,_ef_disembarked,_ef_absent,_ef_no_show
    from latest_effective;

  return jsonb_build_object(
    'total',_total,'expected',_expected,'confirmed',_confirmed,'cancelled',_cancelled,
    'current_step',jsonb_build_object('evaluated',_evaluated,'present',_present,'boarded',_boarded,
      'disembarked',_disembarked,'absent',_absent,'no_show',_no_show,'unresolved',_unresolved),
    'effective_facts',jsonb_build_object('present',_ef_present,'boarded',_ef_boarded,'disembarked',_ef_disembarked,'absent',_ef_absent,'no_show',_ef_no_show));
end $$;
revoke all on function app_private.w09_passenger_summary(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_operation_intelligence(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','public'
as $$
declare
  _op public.operations; _journey jsonb; _passengers jsonb; _mobility jsonb; _hospitality jsonb; _events jsonb; _communications jsonb; _commerce jsonb; _incidents jsonb;
  _current uuid; _health text:='green'; _reasons jsonb:='[]'::jsonb; _unresolved int:=0; _delay int:=0; _urgent_unread bigint:=0; _incident_total int:=0; _expected int:=0;
begin
  _op := app_private.w04_operation(_operation_id,array['owner','admin','operations_agent']);
  _journey := app_private.w09_journey_summary(_operation_id);
  _current := nullif(_journey#>>'{current_step,id}','')::uuid;
  _passengers := app_private.w09_passenger_summary(_operation_id,_current);
  _mobility := public.w05_operation_mobility(_operation_id);
  _hospitality := public.w06_operation_hospitality(_operation_id);
  _events := app_private.w09_events_summary(_operation_id);
  _communications := app_private.w09_communication_summary(_operation_id);
  _commerce := public.get_operation_commerce_summary(_operation_id);
  _incidents := app_private.w09_incident_summary(_operation_id);

  _unresolved := coalesce((_passengers#>>'{current_step,unresolved}')::int,0);
  _expected := coalesce((_passengers->>'expected')::int,0);
  _delay := coalesce((_journey#>>'{delay,minutes}')::int,0);
  _urgent_unread := coalesce((_communications->>'urgent_unread')::bigint,0);
  _incident_total := coalesce((_incidents->>'total')::int,0);

  if _delay >= 30 then _health:='red'; _reasons:=_reasons||jsonb_build_array(jsonb_build_object('code','CURRENT_STEP_DELAYED','severity','critical','value',_delay));
  elsif _delay > 5 then _health:='yellow'; _reasons:=_reasons||jsonb_build_array(jsonb_build_object('code','CURRENT_STEP_DELAYED','severity','warning','value',_delay)); end if;
  if _unresolved > 0 then
    if _health='green' then _health:='yellow'; end if;
    _reasons:=_reasons||jsonb_build_array(jsonb_build_object('code','UNRESOLVED_PASSENGERS','severity','warning','value',_unresolved));
  end if;
  if _op.status='completed' and _expected > 0 then
    if _health='green' then _health:='yellow'; end if;
    _reasons:=_reasons||jsonb_build_array(jsonb_build_object('code','EXPECTED_PARTICIPATIONS_REMAIN','severity','warning','value',_expected));
  end if;
  if _urgent_unread > 0 then
    if _health='green' then _health:='yellow'; end if;
    _reasons:=_reasons||jsonb_build_array(jsonb_build_object('code','URGENT_UNREAD','severity','warning','value',_urgent_unread));
  end if;
  if _incident_total > 0 then
    if _health='green' then _health:='yellow'; end if;
    _reasons:=_reasons||jsonb_build_array(jsonb_build_object('code','INCIDENTS_RECORDED','severity','warning','value',_incident_total));
  end if;

  return jsonb_build_object(
    'schema_version','1.0','generated_at',now(),
    'operation',jsonb_build_object('id',_op.id,'code',_op.code,'name',_op.name,'kind',_op.operation_kind,'status',_op.status,
      'city',_op.primary_city,'region',_op.primary_region,'country',_op.primary_country,'timezone',_op.timezone,
      'planned_start',_op.planned_start,'planned_end',_op.planned_end,'expected_start',_op.expected_start,'expected_end',_op.expected_end,'completed_at',_op.completed_at),
    'journey',_journey,'passengers',_passengers,'mobility',_mobility,'hospitality',_hospitality,'events',_events,
    'communications',_communications,'commerce',_commerce,'incidents',_incidents,
    'health',jsonb_build_object('level',_health,'reasons',_reasons));
end $$;
revoke all on function public.get_operation_intelligence(uuid) from public,anon;
grant execute on function public.get_operation_intelligence(uuid) to authenticated;