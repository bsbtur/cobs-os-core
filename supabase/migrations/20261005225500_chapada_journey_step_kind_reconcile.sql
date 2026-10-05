-- Chapada Experience 2027: reconcile legacy journey kinds.
-- Safe no-op outside environments that contain the canonical operation/steps.

do $$
declare
  _op public.operations;
  _actor uuid;
  _park public.journey_steps;
  _poco public.journey_steps;
begin
  select * into _op
  from public.operations
  where code = 'CHAPADA-EXPERIENCE-20270615'
    and archived_at is null
  order by created_at desc
  limit 1;

  if _op.id is null then
    raise notice 'Chapada canonical operation not present; skipping journey kind reconciliation.';
    return;
  end if;

  if _op.status not in ('draft','planning') then
    raise exception 'Chapada journey baseline is frozen in status %', _op.status;
  end if;

  select * into _park
  from public.journey_steps
  where operation_id = _op.id
    and title = 'Parque Nacional da Chapada dos Veadeiros'
    and archived_at is null
  order by sequence
  limit 1;

  select * into _poco
  from public.journey_steps
  where operation_id = _op.id
    and title = 'Poço Encantado'
    and archived_at is null
  order by sequence
  limit 1;

  if _park.id is null or _poco.id is null then
    raise exception 'Expected Chapada journey steps not found';
  end if;

  perform set_config('app.w04_control','on', true);

  update public.journey_steps
  set step_kind = 'activity'::public.journey_step_kind
  where id in (_park.id, _poco.id)
    and step_kind <> 'activity'::public.journey_step_kind;

  perform set_config('app.w04_control','off', true);

  _actor := auth.uid();

  perform app_private.record_audit_event(
    _op.tenant_id,
    _actor,
    'journey.step_kind_reconciled',
    'journey_step',
    _park.id,
    null,
    jsonb_build_object(
      'operation_id', _op.id,
      'from', _park.step_kind,
      'to', 'activity',
      'reason', 'Chapada canonical itinerary reconciliation'
    )
  );

  perform app_private.record_audit_event(
    _op.tenant_id,
    _actor,
    'journey.step_kind_reconciled',
    'journey_step',
    _poco.id,
    null,
    jsonb_build_object(
      'operation_id', _op.id,
      'from', _poco.step_kind,
      'to', 'activity',
      'reason', 'Chapada canonical itinerary reconciliation'
    )
  );
end;
$$;
