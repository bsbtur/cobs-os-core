ALTER TABLE public.participant_presence_events
  ADD COLUMN supersedes_presence_event_id uuid
    REFERENCES public.participant_presence_events(id) ON DELETE RESTRICT;

ALTER TABLE public.participant_presence_events
  ADD CONSTRAINT presence_supersede_shape
  CHECK (presence_fact <> 'PRESENCE_RETRACTED' OR supersedes_presence_event_id IS NULL);

DROP INDEX IF EXISTS public.presence_fact_once;
CREATE UNIQUE INDEX presence_fact_once
  ON public.participant_presence_events (
    participation_id,
    COALESCE(journey_step_id, '00000000-0000-0000-0000-000000000000'::uuid),
    presence_fact,
    COALESCE(supersedes_presence_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE OR REPLACE FUNCTION public.record_presence_fact(_participation_id uuid, _journey_step_id uuid, _presence_fact presence_fact, _occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _note text DEFAULT NULL::text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _part public.operation_participations; _step public.journey_steps; _op public.operations;
  _at timestamptz; _id uuid; _why text := nullif(btrim(coalesce(_reason,'')),''); _supersedes uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _presence_fact = 'PRESENCE_RETRACTED' then
    raise exception 'A retraction can only be recorded through retract_presence_fact';
  end if;
  select * into _part from public.operation_participations p where p.id = _participation_id;
  if _part.id is null then raise exception 'Participation not found'; end if;
  if not app_private.has_tenant_role(_part.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission for this operation runtime';
  end if;
  if _part.status = 'cancelled' then
    raise exception 'This person is no longer part of the operation';
  end if;
  select * into _step from public.journey_steps s where s.id = _journey_step_id;
  if _step.id is null then raise exception 'Journey step not found'; end if;
  if _step.operation_id <> _part.operation_id or _step.tenant_id <> _part.tenant_id then
    raise exception 'That step does not belong to this participation''s operation';
  end if;
  select * into _op from public.operations o where o.id = _part.operation_id;
  if _op.status not in ('ready','active') then
    raise exception 'Presence can only be recorded while the operation is ready or running';
  end if;

  if _presence_fact = 'NO_SHOW_CONFIRMED' then
    if not app_private.has_tenant_role(_part.tenant_id, array['owner','admin']::public.app_role[]) then
      raise exception 'Only owners and admins can confirm a no-show';
    end if;
    if _why is null then raise exception 'A reason is required to confirm a no-show'; end if;
  end if;
  if _presence_fact = 'ABSENCE_NOTED' and _why is null then
    raise exception 'A reason is required to note an absence';
  end if;
  if _presence_fact = 'BOARDED' then
    if _step.presence_requirement = 'none' then
      raise exception 'This step does not track boarding';
    end if;
    if not app_private.w04_has_event(_step.id, 'BOARDING_STARTED') then
      raise exception 'Boarding has not started for this step yet';
    end if;
  end if;
  if _presence_fact = 'DISEMBARKED' and not app_private.w04_has_event(_step.id, 'ARRIVED') then
    raise exception 'The group has not arrived for this step yet';
  end if;

  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));
  perform app_private.assert_generic_note(_why);
  _at := app_private.w04_assert_occurred_at(_op, _occurred_at);

  -- M3.1 / G-03: a corrected record after a retraction supersedes the retracted one,
  -- so the "one live fact per person per step" rule still holds.
  select e.id into _supersedes
    from public.participant_presence_events e
   where e.participation_id = _part.id
     and coalesce(e.journey_step_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(_step.id, '00000000-0000-0000-0000-000000000000'::uuid)
     and e.presence_fact = _presence_fact
     and exists (select 1 from public.participant_presence_events r
                  where r.retracts_presence_event_id = e.id)
   order by e.recorded_at desc, e.id desc
   limit 1;

  perform set_config('app.w04_control','on', true);
  insert into public.participant_presence_events (tenant_id, operation_id, participation_id,
    journey_step_id, presence_fact, actor_profile_id, occurred_at, note, context, correlation_id,
    supersedes_presence_event_id)
  values (_part.tenant_id, _part.operation_id, _part.id, _step.id, _presence_fact, auth.uid(), _at,
    coalesce(nullif(btrim(coalesce(_note,'')),''), _why),
    case when _why is null then '{}'::jsonb else jsonb_build_object('reason', _why) end,
    gen_random_uuid()::text, _supersedes)
  on conflict do nothing
  returning id into _id;
  perform set_config('app.w04_control','off', true);

  if _presence_fact = 'NO_SHOW_CONFIRMED' then
    perform app_private.record_audit_event(_part.tenant_id, auth.uid(), 'presence.no_show_confirmed',
      'operation_participation', _part.id, null,
      jsonb_build_object('operation_id', _part.operation_id, 'journey_step_id', _step.id, 'reason', _why));
  end if;

  -- W03 roster status is deliberately NOT touched here.
  return jsonb_build_object('participation_id', _part.id, 'journey_step_id', _step.id,
    'presence_fact', _presence_fact, 'presence_event_id', _id, 'replayed', (_id is null),
    'supersedes_presence_event_id', _supersedes);
end;
$function$;