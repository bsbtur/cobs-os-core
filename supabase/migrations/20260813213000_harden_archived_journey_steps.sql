create or replace function app_private.w04_step(_step_id uuid, _roles text[])
returns public.journey_steps
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _step public.journey_steps;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into _step
  from public.journey_steps s
  where s.id = _step_id
    and s.archived_at is null;

  if _step.id is null then
    raise exception 'Journey step not found';
  end if;

  if not app_private.has_tenant_role(_step.tenant_id, _roles::public.app_role[]) then
    raise exception 'You do not have permission for this operation runtime';
  end if;

  return _step;
end;
$function$;

create or replace function public.w04_operation_runtime_state(_operation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _op public.operations;
  _current uuid;
  _next uuid;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);

  select s.id into _current
  from public.journey_steps s
  join public.journey_events e
    on e.journey_step_id = s.id
   and e.event_type = 'STEP_STARTED'
  where s.operation_id = _op.id
    and s.archived_at is null
    and not exists (
      select 1 from public.journey_events c
      where c.journey_step_id = s.id
        and c.event_type in ('STEP_COMPLETED','STEP_SKIPPED')
    )
  order by e.occurred_at desc, e.recorded_at desc
  limit 1;

  select s.id into _next
  from public.journey_steps s
  where s.operation_id = _op.id
    and s.archived_at is null
    and s.id is distinct from _current
    and not exists (
      select 1 from public.journey_events c
      where c.journey_step_id = s.id
        and c.event_type in ('STEP_STARTED','STEP_COMPLETED','STEP_SKIPPED')
    )
  order by s.sequence
  limit 1;

  return jsonb_build_object(
    'operation_id', _op.id,
    'status', _op.status,
    'current_step_id', _current,
    'next_step_id', _next,
    'readiness', case when _current is null then null else public.w04_step_readiness(_current) end
  );
end;
$function$;

create or replace function public.get_my_journey(_operation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _ctx jsonb;
  _steps jsonb;
begin
  _ctx := app_private.w10_assert_effective_access(_operation_id);

  select coalesce(jsonb_agg(x order by (x->>'sequence')::int), '[]'::jsonb) into _steps
  from (
    select jsonb_build_object(
      'step_id', s.id,
      'sequence', s.sequence,
      'title', coalesce(s.traveler_label, s.title),
      'step_kind', s.step_kind,
      'location_label', s.location_label,
      'planned_start', s.planned_start,
      'planned_end', s.planned_end,
      'expected_start', s.expected_start,
      'expected_end', s.expected_end,
      'updates', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'event_type', e.event_type,
          'occurred_at', e.occurred_at,
          'note', e.note
        ) order by e.occurred_at), '[]'::jsonb)
        from public.journey_events e
        where e.journey_step_id = s.id
          and e.traveler_visible = true
          and e.event_type in (
            'STEP_STARTED','STEP_COMPLETED','GATHERING_STARTED',
            'BOARDING_STARTED','BOARDING_COMPLETED','DEPARTED',
            'ARRIVED','DISEMBARKATION_COMPLETED','EXPECTED_TIME_CHANGED'
          )
      )
    ) as x
    from public.journey_steps s
    where s.operation_id = _operation_id
      and s.archived_at is null
      and s.traveler_facing = true
  ) t;

  return jsonb_build_object('operation_id', _operation_id, 'steps', _steps);
end;
$function$;

drop policy if exists "Elevated roles read journey steps" on public.journey_steps;
create policy "Elevated roles read active journey steps"
on public.journey_steps
for select
to authenticated
using (
  archived_at is null
  and app_private.has_tenant_role(
    tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  )
);
