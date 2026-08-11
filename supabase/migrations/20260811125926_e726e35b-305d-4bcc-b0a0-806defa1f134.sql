CREATE OR REPLACE FUNCTION public.assign_seat(_transport_leg_id uuid, _participation_id uuid, _idempotency_key text, _seat_label text DEFAULT NULL::text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _leg public.transport_legs; _row public.transport_seat_assignments;
  _previous public.transport_seat_assignments;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _existing jsonb;
  _label text := nullif(btrim(coalesce(_seat_label,'')),'');
  _capacity integer; _active integer;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _existing := app_private.w05_replay('transport.seat_assign', _key);
  if _existing is not null then return _existing; end if;
  perform app_private.w05_assert_open(_leg);
  perform app_private.assert_generic_note(_why);

  if not exists (select 1 from public.operation_participations p
                 where p.id = _participation_id and p.operation_id = _leg.operation_id) then
    raise exception 'That person is not on this operation roster';
  end if;
  -- SEAT ELIGIBILITY: participant, crew and support only.
  if not app_private.w05_seat_eligible(_participation_id) then
    raise exception 'Only participants, crew and support can be seated, and cancelled people cannot';
  end if;

  -- CAPACITY INVARIANT (DEF-PILOT-015): serialize concurrent seat writes per leg,
  -- reusing the W09 advisory-xact-lock convention. The lock is held for the whole
  -- transaction, so the count below cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('w05:leg:' || _leg.id::text, 0));

  select * into _previous from public.transport_seat_assignments a
    where a.transport_leg_id = _leg.id and a.participation_id = _participation_id
      and a.released_at is null
    for update;

  -- Effective capacity: leg override wins, otherwise the assigned vehicle's capacity.
  -- Both are nullable by frozen W05 contract: unknown capacity means nothing to enforce.
  select coalesce(_leg.capacity_override, v.capacity) into _capacity
    from (select 1) s
    left join public.vehicles v on v.id = _leg.vehicle_id;

  if _capacity is not null then
    select count(*) into _active from public.transport_seat_assignments a
      where a.transport_leg_id = _leg.id
        and a.released_at is null
        and (_previous.id is null or a.id <> _previous.id);
    if _active + 1 > _capacity then
      raise exception 'Vehicle capacity has been reached for this leg';
    end if;
  end if;

  perform set_config('app.w05_control','on', true);
  if _previous.id is not null then
    -- HISTORY IS NEVER DESTROYED: the old row is released, never overwritten.
    update public.transport_seat_assignments
      set released_at = now(), released_by = auth.uid(),
          release_reason = coalesce(_why, 'Seat reassigned')
      where id = _previous.id;
    insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
      actor_profile_id, occurred_at, note, context, correlation_id)
    values (_leg.tenant_id, _leg.operation_id, _leg.id, 'SEAT_RELEASED', auth.uid(), now(), _why,
      jsonb_build_object('participation_id', _participation_id, 'seat_label', _previous.seat_label,
                         'seat_assignment_id', _previous.id, 'cause', 'reassignment'),
      gen_random_uuid()::text);
  end if;

  insert into public.transport_seat_assignments
    (tenant_id, operation_id, transport_leg_id, participation_id, seat_label, assigned_by)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, _participation_id, _label, auth.uid())
  returning * into _row;

  insert into public.transport_events (tenant_id, operation_id, transport_leg_id, event_type,
    actor_profile_id, occurred_at, note, context, correlation_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, 'SEAT_ASSIGNED', auth.uid(), now(), _why,
    jsonb_build_object('participation_id', _participation_id, 'seat_label', _label,
                       'seat_assignment_id', _row.id,
                       'previous_seat_assignment_id', _previous.id),
    gen_random_uuid()::text);
  perform set_config('app.w05_control','off', true);

  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.seat_assigned',
    'transport_seat_assignment', _row.id, _key,
    jsonb_build_object('transport_leg_id', _leg.id, 'participation_id', _participation_id,
                       'seat_label', _label, 'replaced_assignment_id', _previous.id));

  _existing := jsonb_build_object('seat_assignment_id', _row.id, 'transport_leg_id', _leg.id,
                                  'participation_id', _participation_id, 'seat_label', _label);
  perform app_private.w05_claim_key(_leg.tenant_id, 'transport.seat_assign', _key, _existing);
  return _existing;
end;
$function$;