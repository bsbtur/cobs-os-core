-- W04 verification hotfix

-- 1. Least privilege on W04 tables (read-only for signed-in users, nothing for anon)
revoke all on public.journey_steps, public.journey_events, public.participant_presence_events,
  public.playbook_items, public.playbook_executions from anon, authenticated;
grant select on public.journey_steps, public.journey_events, public.participant_presence_events,
  public.playbook_items, public.playbook_executions to authenticated;
grant all on public.journey_steps, public.journey_events, public.participant_presence_events,
  public.playbook_items, public.playbook_executions to service_role;

-- 2. Arrival is reachable across steps: the group departs on one step and arrives on the next
create or replace function public.record_arrival(_journey_step_id uuid, _occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _departed boolean;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select exists (
    select 1 from public.journey_events e
     where e.operation_id = _step.operation_id and e.event_type = 'DEPARTED'
  ) into _departed;
  if not _departed then
    raise exception 'The group has not departed yet';
  end if;
  return app_private.w04_milestone(_journey_step_id, 'ARRIVED', _occurred_at);
end;
$$;

-- 3. Presence semantics: no facts for cancelled participations, absence needs a reason
create or replace function public.record_presence_fact(
  _participation_id uuid, _journey_step_id uuid, _presence_fact public.presence_fact,
  _occurred_at timestamptz default null, _note text default null, _reason text default null)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _part public.operation_participations; _step public.journey_steps; _op public.operations;
  _at timestamptz; _id uuid; _why text := nullif(btrim(coalesce(_reason,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
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
$$;

-- 4. Complete the approved command surface
create or replace function public.deactivate_playbook_item(_playbook_item_id uuid, _reason text)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _why text := nullif(btrim(coalesce(_reason,'')),'');
begin
  if _why is null then raise exception 'A reason is required to deactivate a checklist item'; end if;
  return public.update_playbook_item(_playbook_item_id := _playbook_item_id, _is_active := false);
end;
$$;

revoke all on function public.deactivate_playbook_item(uuid, text) from public, anon;
grant execute on function public.deactivate_playbook_item(uuid, text) to authenticated;