-- Chapada Experience 2027: mark Woodstock room inventory as planning-only
-- until the supplier confirms the exact contracted suite configuration.

do $$
declare
  _op public.operations;
  _stay public.hospitality_stays;
begin
  select * into _op
  from public.operations
  where code = 'CHAPADA-EXPERIENCE-20270615'
    and archived_at is null
  order by created_at desc
  limit 1;

  if _op.id is null then
    raise notice 'Chapada canonical operation not present; skipping rooming planning metadata.';
    return;
  end if;

  select s.* into _stay
  from public.hospitality_stays s
  join public.hospitality_properties p on p.id = s.property_id
  where s.operation_id = _op.id
    and p.name = 'Woodstock Guesthouse'
    and s.status <> 'cancelled'
  order by s.created_at desc
  limit 1;

  if _stay.id is null then
    raise notice 'Chapada Woodstock stay not present; skipping rooming planning metadata.';
    return;
  end if;

  perform set_config('app.w06_control','on', true);

  update public.hospitality_stays
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'room_inventory_status', 'pending_supplier_confirmation',
    'room_inventory_source', 'official_property_public_information',
    'reported_suite_count', 10,
    'reported_group_capacity', 23,
    'commercial_traveler_target_min', 18,
    'commercial_traveler_target_max', 20,
    'room_assignment_policy', 'assign_only_after_supplier_inventory_confirmation',
    'room_inventory_note', 'Do not create contracted room units until the supplier confirms the exact suite configuration for this stay.'
  )
  where id = _stay.id;

  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(
    _stay.tenant_id,
    auth.uid(),
    'hospitality.room_inventory_planning_marked',
    'hospitality_stay',
    _stay.id,
    null,
    jsonb_build_object(
      'operation_id', _op.id,
      'room_inventory_status', 'pending_supplier_confirmation',
      'reported_suite_count', 10,
      'reported_group_capacity', 23
    )
  );
end;
$$;
