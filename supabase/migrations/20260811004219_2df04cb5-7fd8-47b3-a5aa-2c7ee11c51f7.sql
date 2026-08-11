-- =====================================================================
-- COBS OS · M3.1 P1 RECOVERY AMENDMENTS (G-02 + G-03)
-- =====================================================================

-- ---------------------------------------------------------------
-- G-03 SCHEMA: append-only retraction link on presence facts
-- ---------------------------------------------------------------
ALTER TABLE public.participant_presence_events
  ADD COLUMN retracts_presence_event_id uuid
    REFERENCES public.participant_presence_events(id) ON DELETE RESTRICT;

ALTER TABLE public.participant_presence_events
  ADD CONSTRAINT presence_retraction_shape
  CHECK ((presence_fact = 'PRESENCE_RETRACTED') = (retracts_presence_event_id IS NOT NULL));

CREATE UNIQUE INDEX presence_one_effective_retraction
  ON public.participant_presence_events (retracts_presence_event_id)
  WHERE retracts_presence_event_id IS NOT NULL;

-- ---------------------------------------------------------------
-- G-03 DERIVATION: effective (non-retracted) presence
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.w04_step_readiness(_step_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

  -- BINDING RULE: ABSENCE_NOTED never satisfies readiness.
  _satisfying := case _step.presence_requirement
    when 'boarded' then array['BOARDED','NO_SHOW_CONFIRMED']::public.presence_fact[]
    when 'accounted' then array['PRESENT_AT_MEETING_POINT','BOARDED','DISEMBARKED','NO_SHOW_CONFIRMED']::public.presence_fact[]
    else null end;

  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title) order by i.sequence), '[]'::jsonb)
    into _missing_items
    from public.playbook_items i
    where i.journey_step_id = _step.id and i.is_active and i.requirement = 'required'
      and coalesce((
        select e.execution_action from public.playbook_executions e
          where e.playbook_item_id = i.id
          order by e.recorded_at desc, e.id desc limit 1
      ), 'reopened'::public.playbook_execution_action) <> 'completed';
  _checklist_ok := jsonb_array_length(_missing_items) = 0;

  if _satisfying is null then
    return jsonb_build_object(
      'step_id', _step.id, 'requirement', _step.presence_requirement,
      'population', _step.presence_population, 'evaluated', 0, 'satisfied', 0,
      'missing_participations', '[]'::jsonb, 'missing_required_items', _missing_items,
      'presence_ok', true, 'checklist_ok', _checklist_ok, 'ready', _checklist_ok);
  end if;

  with pop as (
    select p.id, pe.full_name
      from public.operation_participations p
      join public.people pe on pe.id = p.person_id
     where p.operation_id = _step.operation_id
       and p.status = 'confirmed'
       and (_step.presence_population = 'all_confirmed' or p.participation_kind = 'participant')
  ), latest as (
    -- M3.1 / G-03: EFFECTIVE presence only. Retraction markers are not facts,
    -- and a retracted fact no longer counts toward derived headcount.
    select distinct on (ev.participation_id) ev.participation_id, ev.presence_fact
      from public.participant_presence_events ev
     where ev.journey_step_id = _step.id
       and ev.presence_fact <> 'PRESENCE_RETRACTED'
       and not exists (
         select 1 from public.participant_presence_events r
          where r.retracts_presence_event_id = ev.id
       )
     order by ev.participation_id, ev.occurred_at desc, ev.recorded_at desc, ev.id desc
  )
  select count(*)::int,
         count(*) filter (where l.presence_fact = any(_satisfying))::int,
         coalesce(jsonb_agg(jsonb_build_object(
             'participation_id', pop.id, 'full_name', pop.full_name,
             'latest_fact', l.presence_fact)
           ) filter (where l.presence_fact is null or not (l.presence_fact = any(_satisfying))), '[]'::jsonb)
    into _evaluated, _satisfied, _missing_people
    from pop left join latest l on l.participation_id = pop.id;

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
    'ready', _checklist_ok and (_evaluated = _satisfied));
end;
$function$;

-- ---------------------------------------------------------------
-- G-03: record_presence_fact must never mint a retraction marker
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_presence_fact(_participation_id uuid, _journey_step_id uuid, _presence_fact presence_fact, _occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _note text DEFAULT NULL::text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _part public.operation_participations; _step public.journey_steps; _op public.operations;
  _at timestamptz; _id uuid; _why text := nullif(btrim(coalesce(_reason,'')),'');
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

  perform set_config('app.w04_control','on', true);
  insert into public.participant_presence_events (tenant_id, operation_id, participation_id,
    journey_step_id, presence_fact, actor_profile_id, occurred_at, note, context, correlation_id)
  values (_part.tenant_id, _part.operation_id, _part.id, _step.id, _presence_fact, auth.uid(), _at,
    coalesce(nullif(btrim(coalesce(_note,'')),''), _why),
    case when _why is null then '{}'::jsonb else jsonb_build_object('reason', _why) end,
    gen_random_uuid()::text)
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
    'presence_fact', _presence_fact, 'presence_event_id', _id, 'replayed', (_id is null));
end;
$function$;

-- ---------------------------------------------------------------
-- G-03 COMMAND: retract_presence_fact
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retract_presence_fact(_presence_fact_id uuid, _reason text, _idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _orig public.participant_presence_events;
  _op public.operations;
  _why text := nullif(btrim(coalesce(_reason,'')),'');
  _existing jsonb;
  _id uuid;
  _result jsonb;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _idempotency_key is null then raise exception 'An idempotency key is required'; end if;
  if _why is null then raise exception 'A reason is required to retract a presence record'; end if;
  perform app_private.assert_generic_note(_why);

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = _uid
      and k.action = 'presence.retract'
      and k.idempotency_key = _idempotency_key::text;
  if _existing is not null then return _existing; end if;

  select * into _orig from public.participant_presence_events e where e.id = _presence_fact_id;
  -- Generic message: never disclose existence across tenants.
  if _orig.id is null
     or not app_private.has_tenant_role(_orig.tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Presence record not found';
  end if;

  if _orig.presence_fact = 'PRESENCE_RETRACTED' then
    raise exception 'A retraction cannot itself be retracted';
  end if;
  if exists (select 1 from public.participant_presence_events r
              where r.retracts_presence_event_id = _orig.id) then
    raise exception 'This presence record has already been retracted';
  end if;

  select * into _op from public.operations o where o.id = _orig.operation_id;

  perform set_config('app.w04_control','on', true);
  insert into public.participant_presence_events (tenant_id, operation_id, participation_id,
    journey_step_id, presence_fact, actor_profile_id, occurred_at, note, context,
    correlation_id, retracts_presence_event_id)
  values (_orig.tenant_id, _orig.operation_id, _orig.participation_id, _orig.journey_step_id,
    'PRESENCE_RETRACTED', _uid, now(), _why,
    jsonb_build_object('reason', _why,
                       'retracted_presence_event_id', _orig.id,
                       'retracted_presence_fact', _orig.presence_fact),
    gen_random_uuid()::text, _orig.id)
  returning id into _id;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(_orig.tenant_id, _uid, 'presence.retracted',
    'participant_presence_event', _orig.id, _idempotency_key::text,
    jsonb_build_object('operation_id', _orig.operation_id,
                       'journey_step_id', _orig.journey_step_id,
                       'participation_id', _orig.participation_id,
                       'retracted_presence_fact', _orig.presence_fact,
                       'retraction_event_id', _id,
                       'reason', _why));

  _result := jsonb_build_object('retracted_presence_event_id', _orig.id,
                                'retraction_event_id', _id,
                                'presence_fact', _orig.presence_fact,
                                'journey_step_id', _orig.journey_step_id);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_orig.tenant_id, _uid, 'presence.retract', _idempotency_key::text, _result);
  return _result;
end;
$function$;

REVOKE ALL ON FUNCTION public.retract_presence_fact(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.retract_presence_fact(uuid, text, uuid) TO authenticated;

-- ---------------------------------------------------------------
-- G-02 COMMAND: reinstate_operation (cancelled -> planning, owner only)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reinstate_operation(_operation_id uuid, _reason text, _idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _op public.operations;
  _why text := nullif(btrim(coalesce(_reason,'')),'');
  _existing jsonb;
  _result jsonb;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _idempotency_key is null then raise exception 'An idempotency key is required'; end if;
  if _why is null then raise exception 'A reason is required to reinstate an operation'; end if;
  perform app_private.assert_generic_note(_why);

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = _uid
      and k.action = 'operation.reinstate'
      and k.idempotency_key = _idempotency_key::text;
  if _existing is not null then return _existing; end if;

  select * into _op from public.operations o where o.id = _operation_id for update;
  -- Governance action: owner only. Generic message across tenants.
  if _op.id is null
     or not app_private.has_tenant_role(_op.tenant_id, array['owner']::public.app_role[]) then
    raise exception 'Operation not found';
  end if;

  if _op.status <> 'cancelled' then
    raise exception 'Only a cancelled operation can be reinstated';
  end if;

  -- Cancellation evidence (cancelled_at, cancellation_reason) is deliberately preserved.
  perform set_config('app.op_control', 'on', true);
  update public.operations set status = 'planning' where id = _op.id;
  perform set_config('app.op_control', 'off', true);

  perform app_private.record_audit_event(_op.tenant_id, _uid, 'operation.reinstated',
    'operation', _op.id, _idempotency_key::text,
    jsonb_build_object('from_status', 'cancelled', 'to_status', 'planning',
                       'reason', _why,
                       'original_cancelled_at', _op.cancelled_at,
                       'original_cancellation_reason', _op.cancellation_reason));

  _result := jsonb_build_object('operation_id', _op.id, 'status', 'planning',
                                'previous_status', 'cancelled');
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, _uid, 'operation.reinstate', _idempotency_key::text, _result);
  return _result;
end;
$function$;

REVOKE ALL ON FUNCTION public.reinstate_operation(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reinstate_operation(uuid, text, uuid) TO authenticated;