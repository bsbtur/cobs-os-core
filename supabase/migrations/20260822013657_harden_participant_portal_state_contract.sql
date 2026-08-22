create or replace function app_private.w10_effective_access_for(_operation_id uuid, _profile_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog','public'
as $function$
  select jsonb_build_object(
           'grant_id',             g.id,
           'grant_status',         g.status,
           'tenant_id',            g.tenant_id,
           'operation_id',         g.operation_id,
           'person_id',            g.person_id,
           'participation_id',     g.participation_id,
           'participation_status', pa.status,
           'operation_status',     o.status,
           'historical',           (o.status = 'completed' or o.archived_at is not null),
           'read_only',            (o.status = 'completed' or o.archived_at is not null)
         )
    from public.participant_access_grants g
    join public.people p
      on p.id = g.person_id and p.tenant_id = g.tenant_id
    join public.operation_participations pa
      on pa.id = g.participation_id and pa.tenant_id = g.tenant_id
    join public.operations o
      on o.id = g.operation_id and o.tenant_id = g.tenant_id
   where g.operation_id = _operation_id
     and g.status = 'active'
     and _profile_id is not null
     and g.profile_id = _profile_id
     and p.profile_id = _profile_id
     and pa.person_id = g.person_id
     and pa.operation_id = g.operation_id
     and pa.status in ('expected','confirmed')
     and o.status <> 'cancelled'
   limit 1
$function$;

create or replace function public.get_my_journey(_operation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','public'
as $function$
declare _ctx jsonb; _steps jsonb;
begin
  _ctx := app_private.w10_assert_effective_access(_operation_id);
  select coalesce(jsonb_agg(x order by (x->>'sequence')::int), '[]'::jsonb) into _steps
  from (
    select jsonb_build_object(
      'step_id', s.id, 'sequence', s.sequence, 'title', coalesce(s.traveler_label, s.title),
      'step_kind', s.step_kind, 'location_label', s.location_label,
      'planned_start', s.planned_start, 'planned_end', s.planned_end,
      'expected_start', s.expected_start, 'expected_end', s.expected_end,
      'updates', (
        select coalesce(jsonb_agg(jsonb_build_object('event_type', e.event_type, 'occurred_at', e.occurred_at, 'note', e.note) order by e.occurred_at), '[]'::jsonb)
        from public.journey_events e
        where e.journey_step_id = s.id and e.traveler_visible = true
          and e.event_type in ('STEP_STARTED','STEP_COMPLETED','GATHERING_STARTED','BOARDING_STARTED','BOARDING_COMPLETED','DEPARTED','ARRIVED','DISEMBARKATION_COMPLETED','EXPECTED_TIME_CHANGED')
      )
    ) as x
    from public.journey_steps s
    where s.operation_id = _operation_id and s.archived_at is null and s.traveler_facing = true
  ) t;
  return jsonb_build_object(
    'operation_id', _operation_id,
    'operation_status', _ctx->>'operation_status',
    'participation_status', _ctx->>'participation_status',
    'historical', coalesce((_ctx->>'historical')::boolean,false),
    'read_only', coalesce((_ctx->>'read_only')::boolean,false),
    'steps', _steps
  );
end;
$function$;

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
      'my_seat', jsonb_build_object(
         'seat_label', sa.seat_label,
         'assigned_at', sa.assigned_at,
         'released_at', sa.released_at,
         'active', (sa.released_at is null)),
      'stops', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'sequence', st.sequence,
                 'label', st.label,
                 'is_pickup', st.is_pickup,
                 'planned_time', st.planned_time,
                 'expected_time', st.expected_time) order by st.sequence), '[]'::jsonb)
        from public.transport_leg_stops st where st.transport_leg_id = l.id)
    ) as x
    from public.transport_seat_assignments sa
    join public.transport_legs l
      on l.id = sa.transport_leg_id and l.operation_id = _operation_id
    where sa.operation_id = _operation_id
      and sa.participation_id = _pid
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

create or replace function public.get_my_stay(_operation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','public'
as $function$
declare _ctx jsonb; _pid uuid; _stays jsonb;
begin
  _ctx := app_private.w10_assert_effective_access(_operation_id);
  _pid := (_ctx->>'participation_id')::uuid;
  select coalesce(jsonb_agg(x order by x->>'planned_check_in'), '[]'::jsonb) into _stays
  from (
    select jsonb_build_object(
      'stay_id', s.id,
      'name', s.name,
      'status', s.status,
      'planned_check_in', s.planned_check_in,
      'planned_check_out', s.planned_check_out,
      'expected_check_in', s.expected_check_in,
      'expected_check_out', s.expected_check_out,
      'checkin_open', (s.checkin_opened_at is not null),
      'property', jsonb_build_object(
        'name', pr.name,
        'property_kind', pr.property_kind,
        'country_code', pr.country_code,
        'region', pr.region,
        'city', pr.city,
        'address_label', pr.address_label,
        'timezone', pr.timezone),
      'my_room', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'label', r.label,
                 'floor_label', r.floor_label,
                 'assigned_at', ra.assigned_at,
                 'released_at', ra.released_at,
                 'active', (ra.released_at is null)) order by ra.assigned_at), '[]'::jsonb)
        from public.hospitality_room_assignments ra
        join public.hospitality_rooms r on r.id = ra.room_id
        where ra.stay_id = s.id and ra.stay_participation_id = sp.id)
    ) as x
    from public.hospitality_stay_participations sp
    join public.hospitality_stays s on s.id = sp.stay_id
    join public.hospitality_properties pr on pr.id = s.property_id
    where sp.participation_id = _pid
      and sp.is_active = true
      and s.operation_id = _operation_id
      and s.status <> 'cancelled'
  ) t;
  return jsonb_build_object(
    'operation_id', _operation_id,
    'operation_status', _ctx->>'operation_status',
    'participation_status', _ctx->>'participation_status',
    'historical', coalesce((_ctx->>'historical')::boolean,false),
    'read_only', coalesce((_ctx->>'read_only')::boolean,false),
    'stays', _stays
  );
end;
$function$;