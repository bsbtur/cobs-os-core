create or replace function app_private.w09_passenger_summary(_operation_id uuid, _current_step_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','public'
as $$
declare
  _total int; _expected int; _confirmed int; _cancelled int;
  _evaluated int := 0; _present int := 0; _boarded int := 0; _disembarked int := 0;
  _absent int := 0; _no_show int := 0; _unresolved int := 0;
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

  return jsonb_build_object(
    'total',_total,'expected',_expected,'confirmed',_confirmed,'cancelled',_cancelled,
    'current_step',jsonb_build_object('evaluated',_evaluated,'present',_present,'boarded',_boarded,
      'disembarked',_disembarked,'absent',_absent,'no_show',_no_show,'unresolved',_unresolved));
end $$;

create or replace function app_private.w09_journey_summary(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','public'
as $$
declare
  _runtime jsonb; _current uuid; _next uuid;
  _total int; _completed int; _skipped int; _active int; _pending int; _progress numeric;
  _current_obj jsonb; _next_obj jsonb; _delay int := 0; _delay_status text := 'on_time';
begin
  _runtime := public.w04_operation_runtime_state(_operation_id);
  _current := nullif(_runtime->>'current_step_id','')::uuid;
  _next := nullif(_runtime->>'next_step_id','')::uuid;

  select count(*)::int,
         count(*) filter (where exists(select 1 from public.journey_events e where e.journey_step_id=s.id and e.event_type='STEP_COMPLETED'))::int,
         count(*) filter (where exists(select 1 from public.journey_events e where e.journey_step_id=s.id and e.event_type='STEP_SKIPPED'))::int,
         count(*) filter (where exists(select 1 from public.journey_events e where e.journey_step_id=s.id and e.event_type='STEP_STARTED') and not exists(select 1 from public.journey_events e where e.journey_step_id=s.id and e.event_type in ('STEP_COMPLETED','STEP_SKIPPED')))::int
    into _total,_completed,_skipped,_active
    from public.journey_steps s
   where s.operation_id=_operation_id and s.archived_at is null;
  _pending := greatest(_total-_completed-_skipped-_active,0);
  _progress := case when _total=0 then 0 else round(((_completed+_skipped)::numeric*100)/_total,1) end;

  if _current is not null then
    select jsonb_build_object('id',s.id,'sequence',s.sequence,'title',s.title,'kind',s.step_kind,
      'planned_start',s.planned_start,'expected_start',s.expected_start,'readiness',public.w04_step_readiness(s.id))
      into _current_obj from public.journey_steps s where s.id=_current;
    select case when s.planned_start is not null and s.expected_start is not null
                then round(extract(epoch from (s.expected_start-s.planned_start))/60)::int else 0 end
      into _delay from public.journey_steps s where s.id=_current;
    _delay_status := case when _delay >= 30 then 'critical' when _delay > 5 then 'delayed' when _delay < -5 then 'early' else 'on_time' end;
  end if;
  if _next is not null then
    select jsonb_build_object('id',s.id,'sequence',s.sequence,'title',s.title,'kind',s.step_kind,
      'planned_start',s.planned_start,'expected_start',s.expected_start)
      into _next_obj from public.journey_steps s where s.id=_next;
  end if;

  return jsonb_build_object('total_steps',_total,'completed_steps',_completed,'skipped_steps',_skipped,
    'active_steps',_active,'pending_steps',_pending,'progress_percent',_progress,
    'current_step',_current_obj,'next_step',_next_obj,'delay',jsonb_build_object('minutes',_delay,'status',_delay_status));
end $$;

create or replace function app_private.w09_events_summary(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','public'
as $$
declare _items jsonb; _total int; _scheduled int:=0; _active int:=0; _completed int:=0; _cancelled int:=0;
        _total_sessions int:=0; _active_sessions int:=0; _completed_sessions int:=0;
begin
  with e as (
    select ev.id,ev.name,ev.source_kind,ev.status,
           app_private.w07_derived_event_runtime_state(ev.id) runtime_state
      from public.events ev where ev.operation_id=_operation_id
  )
  select count(*)::int,
         count(*) filter(where runtime_state='scheduled')::int,
         count(*) filter(where runtime_state in ('running','paused'))::int,
         count(*) filter(where runtime_state='completed')::int,
         count(*) filter(where runtime_state='cancelled')::int,
         coalesce(jsonb_agg(jsonb_build_object('event_id',id,'name',name,'source_kind',source_kind,'status',status,'runtime_state',runtime_state) order by name),'[]'::jsonb)
    into _total,_scheduled,_active,_completed,_cancelled,_items from e;

  select count(*)::int,
         count(*) filter(where app_private.w07_derived_session_runtime_state(s.id) in ('running','paused'))::int,
         count(*) filter(where app_private.w07_derived_session_runtime_state(s.id)='completed')::int
    into _total_sessions,_active_sessions,_completed_sessions
    from public.event_sessions s join public.events e on e.id=s.event_id where e.operation_id=_operation_id;

  return jsonb_build_object('total',_total,'scheduled',_scheduled,'active',_active,'completed',_completed,'cancelled',_cancelled,
    'total_sessions',_total_sessions,'active_sessions',_active_sessions,'completed_sessions',_completed_sessions,'items',_items);
end $$;

create or replace function app_private.w09_communication_summary(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','public'
as $$
declare _total int; _published int; _urgent int; _cancelled int; _recipients bigint; _reached bigint; _read bigint; _unread bigint; _urgent_unread bigint; _rate numeric;
begin
  select count(*)::int,
         count(*) filter(where status='published')::int,
         count(*) filter(where priority='urgent' and status='published')::int,
         count(*) filter(where status='cancelled')::int
    into _total,_published,_urgent,_cancelled from public.messages where operation_id=_operation_id;

  select count(*)::bigint,
         count(*) filter(where r.in_app_eligible)::bigint,
         count(*) filter(where r.first_read_at is not null)::bigint,
         count(*) filter(where r.first_read_at is null)::bigint,
         count(*) filter(where r.first_read_at is null and m.priority='urgent' and m.status='published')::bigint
    into _recipients,_reached,_read,_unread,_urgent_unread
    from public.message_recipients r join public.messages m on m.id=r.message_id
   where m.operation_id=_operation_id;
  _rate := case when _recipients=0 then 0 else round((_read::numeric*100)/_recipients,1) end;
  return jsonb_build_object('total_messages',_total,'published',_published,'urgent',_urgent,'cancelled',_cancelled,
    'recipients',_recipients,'reached',_reached,'read',_read,'unread',_unread,'read_rate_percent',_rate,'urgent_unread',_urgent_unread);
end $$;

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
  select coalesce(jsonb_agg(x order by x->>'occurred_at' desc),'[]'::jsonb) into _latest from (
    select jsonb_build_object('domain','journey','id',id,'occurred_at',occurred_at,'note',note) x from public.journey_events where operation_id=_operation_id and event_type='INCIDENT_NOTED'
    union all
    select jsonb_build_object('domain','mobility','id',id,'occurred_at',occurred_at,'note',note) x from public.transport_events where operation_id=_operation_id and event_type='TRANSPORT_INCIDENT_NOTED'
    union all
    select jsonb_build_object('domain','hospitality','id',id,'occurred_at',occurred_at,'note',note) x from public.hospitality_events where operation_id=_operation_id and event_type='HOSPITALITY_ISSUE_NOTED'
    order by (x->>'occurred_at') desc limit 20
  ) q;
  return jsonb_build_object('total',_journey+_mobility+_hospitality+_events,'journey',_journey,'mobility',_mobility,'hospitality',_hospitality,'events',_events,'latest',_latest);
end $$;

create or replace function public.get_operation_intelligence(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','public'
as $$
declare
  _op public.operations; _journey jsonb; _passengers jsonb; _mobility jsonb; _hospitality jsonb; _events jsonb; _communications jsonb; _commerce jsonb; _incidents jsonb;
  _current uuid; _health text:='green'; _reasons jsonb:='[]'::jsonb; _unresolved int:=0; _delay int:=0; _urgent_unread bigint:=0; _incident_total int:=0;
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
  _delay := coalesce((_journey#>>'{delay,minutes}')::int,0);
  _urgent_unread := coalesce((_communications->>'urgent_unread')::bigint,0);
  _incident_total := coalesce((_incidents->>'total')::int,0);

  if _delay >= 30 then _health:='red'; _reasons:=_reasons||jsonb_build_array(jsonb_build_object('code','CURRENT_STEP_DELAYED','severity','critical','value',_delay));
  elsif _delay > 5 then _health:='yellow'; _reasons:=_reasons||jsonb_build_array(jsonb_build_object('code','CURRENT_STEP_DELAYED','severity','warning','value',_delay)); end if;
  if _unresolved > 0 then
    if _health='green' then _health:='yellow'; end if;
    _reasons:=_reasons||jsonb_build_array(jsonb_build_object('code','UNRESOLVED_PASSENGERS','severity','warning','value',_unresolved));
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

revoke all on function app_private.w09_passenger_summary(uuid,uuid) from public,anon,authenticated;
revoke all on function app_private.w09_journey_summary(uuid) from public,anon,authenticated;
revoke all on function app_private.w09_events_summary(uuid) from public,anon,authenticated;
revoke all on function app_private.w09_communication_summary(uuid) from public,anon,authenticated;
revoke all on function app_private.w09_incident_summary(uuid) from public,anon,authenticated;
revoke all on function public.get_operation_intelligence(uuid) from public,anon;
grant execute on function public.get_operation_intelligence(uuid) to authenticated;