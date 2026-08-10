create or replace function public.set_step_expected_window(
  _journey_step_id uuid, _expected_start timestamptz, _expected_end timestamptz, _reason text)
returns jsonb language plpgsql security definer set search_path = 'pg_catalog','public' as $$
declare _step public.journey_steps; _op public.operations; _id uuid;
  _why text := nullif(btrim(coalesce(_reason,'')),''); _ctx jsonb;
begin
  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;
  if _why is null then raise exception 'A reason is required to change the forecast'; end if;
  if _expected_start is not null and _expected_end is not null and _expected_end < _expected_start then
    raise exception 'Invalid expected window';
  end if;
  -- APPROVED SCOPE: forecasting is a planning-and-runtime activity.
  -- 'draft' is deliberately excluded: an operation without a committed plan has no forecast.
  if _op.status not in ('planning','ready','active') then
    raise exception 'A % operation does not have an active forecast', _op.status;
  end if;
  if app_private.w04_has_event(_step.id, 'STEP_COMPLETED')
     or app_private.w04_has_event(_step.id, 'STEP_SKIPPED') then
    raise exception 'This step is already closed and its forecast can no longer change';
  end if;
  perform app_private.assert_generic_note(_why);

  -- Idempotent intent: an unchanged forecast produces no new evidence.
  if _step.expected_start is not distinct from _expected_start
     and _step.expected_end is not distinct from _expected_end then
    return jsonb_build_object('journey_step_id', _step.id, 'unchanged', true,
      'expected_start', _step.expected_start, 'expected_end', _step.expected_end);
  end if;

  _ctx := jsonb_build_object('previous_expected_start', _step.expected_start,
                             'previous_expected_end', _step.expected_end,
                             'new_expected_start', _expected_start,
                             'new_expected_end', _expected_end,
                             'reason', _why);

  perform set_config('app.w04_control','on', true);
  update public.journey_steps
    set expected_start = _expected_start, expected_end = _expected_end
    where id = _step.id;
  -- A forecast change is recorded when the decision is taken, which may be long
  -- before the operation window opens. The runtime backdating guard therefore
  -- does not apply here; the timestamp is always server-side now().
  insert into public.journey_events
    (tenant_id, operation_id, journey_step_id, event_type, actor_profile_id,
     occurred_at, note, traveler_visible, context, correlation_id)
  values (_op.tenant_id, _op.id, _step.id, 'EXPECTED_TIME_CHANGED', auth.uid(), now(), null,
          app_private.w04_traveler_visibility('EXPECTED_TIME_CHANGED') and coalesce(_step.traveler_facing, false),
          _ctx, gen_random_uuid()::text)
  on conflict do nothing
  returning id into _id;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'journey.step_expected_time_changed',
    'journey_step', _step.id, null, _ctx);

  return jsonb_build_object('journey_step_id', _step.id, 'journey_event_id', _id,
    'expected_start', _expected_start, 'expected_end', _expected_end);
end;
$$;