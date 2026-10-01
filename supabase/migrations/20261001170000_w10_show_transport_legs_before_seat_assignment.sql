-- W10: expose operation transport legs to authorized travelers before seat assignment.
-- Seat data remains participant-private and is joined only for the current participation.

create or replace function public.get_my_mobility(_operation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','public'
as $function$
declare _ctx jsonb; _pid uuid; _legs jsonb;
begin
  _ctx := app_private.w10_assert_effective_access(_operation_id);
  _pid := (_ctx->>'participation_id')::uuid;

  select coalesce(jsonb_agg(x order by (x->>'sequence')::int), '[]'::jsonb) into _legs
  from (
    select jsonb_build_object(
      'leg_id', l.id,
      'sequence', l.sequence,
      'title', l.title,
      'leg_kind', l.leg_kind,
      'journey_step_id', l.journey_step_id,
      'origin_label', l.origin_label,
      'destination_label', l.destination_label,
      'planned_departure', l.planned_departure,
      'planned_arrival', l.planned_arrival,
      'expected_departure', l.expected_departure,
      'expected_arrival', l.expected_arrival,
      'return_time', l.return_time,
      'my_seat', case
        when sa.id is null then null
        else jsonb_build_object(
          'seat_label', sa.seat_label,
          'assigned_at', sa.assigned_at,
          'released_at', sa.released_at,
          'active', (sa.released_at is null))
      end,
      'stops', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'sequence', st.sequence,
          'label', st.label,
          'is_pickup', st.is_pickup,
          'planned_time', st.planned_time,
          'expected_time', st.expected_time
        ) order by st.sequence), '[]'::jsonb)
        from public.transport_leg_stops st
        where st.transport_leg_id = l.id)
    ) as x
    from public.transport_legs l
    left join lateral (
      select seat.id, seat.seat_label, seat.assigned_at, seat.released_at
      from public.transport_seat_assignments seat
      where seat.operation_id = _operation_id
        and seat.transport_leg_id = l.id
        and seat.participation_id = _pid
        and seat.released_at is null
      order by seat.assigned_at desc
      limit 1
    ) sa on true
    where l.operation_id = _operation_id
  ) t;

  return jsonb_build_object(
    'operation_id', _operation_id,
    'operation_status', _ctx->>'operation_status',
    'participation_status', _ctx->>'participation_status',
    'historical', coalesce((_ctx->>'historical')::boolean,false),
    'read_only', coalesce((_ctx->>'read_only')::boolean,false),
    'legs', _legs
  );
end;
$function$;
