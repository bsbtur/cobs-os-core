create or replace function public.w04_step_readiness(_step_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _step public.journey_steps;
  _satisfying public.presence_fact[];
  _evaluated int := 0;
  _satisfied int := 0;
  _missing_people jsonb := '[]'::jsonb;
  _missing_items jsonb := '[]'::jsonb;
  _checklist_ok boolean;
begin
  _step := app_private.w04_step(_step_id, array['owner','admin','operations_agent']);

  _satisfying := case _step.presence_requirement
    when 'boarded' then array['BOARDED','NO_SHOW_CONFIRMED']::public.presence_fact[]
    when 'accounted' then array['PRESENT_AT_MEETING_POINT','BOARDED','DISEMBARKED','NO_SHOW_CONFIRMED']::public.presence_fact[]
    else null end;

  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title) order by i.sequence), '[]'::jsonb)
    into _missing_items
    from public.playbook_items i
    where i.journey_step_id = _step.id
      and i.is_active
      and i.requirement = 'required'
      and coalesce((
        select e.execution_action
          from public.playbook_executions e
         where e.playbook_item_id = i.id
         order by e.recorded_at desc, e.id desc
         limit 1
      ), 'reopened'::public.playbook_execution_action) <> 'completed';

  _checklist_ok := jsonb_array_length(_missing_items) = 0;

  if _satisfying is null then
    return jsonb_build_object(
      'step_id', _step.id,
      'requirement', _step.presence_requirement,
      'population', _step.presence_population,
      'evaluated', 0,
      'satisfied', 0,
      'missing_participations', '[]'::jsonb,
      'missing_required_items', _missing_items,
      'presence_ok', true,
      'checklist_ok', _checklist_ok,
      'ready', _checklist_ok
    );
  end if;

  with pop as (
    select p.id, pe.full_name
      from public.operation_participations p
      join public.people pe
        on pe.id = p.person_id
       and pe.tenant_id = p.tenant_id
     where p.operation_id = _step.operation_id
       and p.status <> 'cancelled'
       and (
         (_step.presence_population = 'participants' and p.participation_kind = 'participant')
         or
         (_step.presence_population = 'all_confirmed' and p.status = 'confirmed')
       )
  ), latest as (
    select distinct on (ev.participation_id)
           ev.participation_id,
           ev.presence_fact
      from public.participant_presence_events ev
     where ev.journey_step_id = _step.id
       and ev.presence_fact <> 'PRESENCE_RETRACTED'
       and not exists (
         select 1
           from public.participant_presence_events r
          where r.retracts_presence_event_id = ev.id
       )
     order by ev.participation_id, ev.occurred_at desc, ev.recorded_at desc, ev.id desc
  )
  select count(*)::int,
         count(*) filter (where l.presence_fact = any(_satisfying))::int,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'participation_id', pop.id,
               'full_name', pop.full_name,
               'latest_fact', l.presence_fact
             )
           ) filter (where l.presence_fact is null or not (l.presence_fact = any(_satisfying))),
           '[]'::jsonb
         )
    into _evaluated, _satisfied, _missing_people
    from pop
    left join latest l on l.participation_id = pop.id;

  return jsonb_build_object(
    'step_id', _step.id,
    'requirement', _step.presence_requirement,
    'population', _step.presence_population,
    'evaluated', _evaluated,
    'satisfied', _satisfied,
    'missing_participations', _missing_people,
    'missing_required_items', _missing_items,
    'presence_ok', (_evaluated = _satisfied),
    'checklist_ok', _checklist_ok,
    'ready', _checklist_ok and (_evaluated = _satisfied)
  );
end;
$function$;