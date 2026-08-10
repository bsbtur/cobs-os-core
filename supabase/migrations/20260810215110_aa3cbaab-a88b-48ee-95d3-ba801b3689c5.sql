-- ============ W10-C PROJECTION LAYER (9 read functions) ============

-- 1. OPERATOR: list grants
create or replace function public.list_participant_access_grants(
  _tenant_id uuid, _operation_id uuid default null)
returns jsonb
language sql stable security definer
set search_path to 'pg_catalog','public'
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'grant_id', g.id,
      'operation_id', g.operation_id,
      'operation_name', o.name,
      'person_id', g.person_id,
      'person_full_name', p.full_name,
      'participation_id', g.participation_id,
      'participation_status', pa.status,
      'profile_id', g.profile_id,
      'status', g.status,
      'origin', g.origin,
      'activated_at', g.activated_at,
      'revoked_at', g.revoked_at,
      'revoked_reason', g.revoked_reason,
      'created_at', g.created_at
    ) as x
    from public.participant_access_grants g
    join public.operations o on o.id = g.operation_id and o.tenant_id = g.tenant_id
    join public.people p on p.id = g.person_id and p.tenant_id = g.tenant_id
    join public.operation_participations pa
      on pa.id = g.participation_id and pa.tenant_id = g.tenant_id
    where g.tenant_id = _tenant_id
      and (_operation_id is null or g.operation_id = _operation_id)
      and app_private.has_tenant_role(_tenant_id,
            array['owner','admin','operations_agent']::public.app_role[])
  ) s
$$;

-- 2. SELF: own access surface
create or replace function public.get_my_participant_access()
returns jsonb
language sql stable security definer
set search_path to 'pg_catalog','public'
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'grant_id', g.id,
      'operation_id', g.operation_id,
      'operation_name', o.name,
      'status', g.status,
      'origin', g.origin,
      'activated_at', g.activated_at,
      'revoked_at', g.revoked_at,
      'created_at', g.created_at,
      'effective', (app_private.w10_effective_access(g.operation_id) is not null)
    ) as x
    from public.participant_access_grants g
    join public.operations o on o.id = g.operation_id and o.tenant_id = g.tenant_id
    where auth.uid() is not null
      and g.profile_id = auth.uid()
  ) s
$$;

-- 3. SELF: operations derived from EFFECTIVE grants only
create or replace function public.get_my_operations()
returns jsonb
language sql stable security definer
set search_path to 'pg_catalog','public'
as $$
  select coalesce(jsonb_agg(x order by x->>'planned_start'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'operation_id', o.id,
      'name', o.name,
      'operation_kind', o.operation_kind,
      'primary_country', o.primary_country,
      'primary_region', o.primary_region,
      'primary_city', o.primary_city,
      'timezone', o.timezone,
      'planned_start', o.planned_start,
      'planned_end', o.planned_end,
      'expected_start', o.expected_start,
      'expected_end', o.expected_end,
      'historical', (o.status = 'completed' or o.archived_at is not null),
      'participation_kind', pa.participation_kind
    ) as x
    from public.participant_access_grants g
    join public.people p on p.id = g.person_id and p.tenant_id = g.tenant_id
    join public.operation_participations pa
      on pa.id = g.participation_id and pa.tenant_id = g.tenant_id
    join public.operations o on o.id = g.operation_id and o.tenant_id = g.tenant_id
    where auth.uid() is not null
      and g.status = 'active'
      and g.profile_id = auth.uid()
      and p.profile_id = auth.uid()
      and pa.person_id = g.person_id
      and pa.operation_id = g.operation_id
      and pa.status in ('expected','confirmed')
      and o.status <> 'cancelled'
  ) s
$$;

-- 4. SELF: operation overview
create or replace function public.get_my_operation_overview(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public'
as $$
declare _ctx jsonb; _o public.operations; _pa public.operation_participations;
begin
  _ctx := app_private.w10_assert_effective_access(_operation_id);
  select * into _o from public.operations where id = _operation_id;
  select * into _pa from public.operation_participations
   where id = (_ctx->>'participation_id')::uuid;
  return jsonb_build_object(
    'operation_id', _o.id,
    'name', _o.name,
    'operation_kind', _o.operation_kind,
    'primary_country', _o.primary_country,
    'primary_region', _o.primary_region,
    'primary_city', _o.primary_city,
    'timezone', _o.timezone,
    'planned_start', _o.planned_start,
    'planned_end', _o.planned_end,
    'expected_start', _o.expected_start,
    'expected_end', _o.expected_end,
    'historical', (_ctx->>'historical')::boolean,
    'read_only', (_ctx->>'historical')::boolean,
    'my_participation_kind', _pa.participation_kind,
    'my_participation_status', _pa.status
  );
end; $$;

-- 5. SELF: traveler-facing journey
create or replace function public.get_my_journey(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public'
as $$
declare _ctx jsonb; _steps jsonb;
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
                 'note', e.note) order by e.occurred_at), '[]'::jsonb)
        from public.journey_events e
        where e.journey_step_id = s.id
          and e.traveler_visible = true
          and e.event_type in ('STEP_STARTED','STEP_COMPLETED','GATHERING_STARTED',
                               'BOARDING_STARTED','BOARDING_COMPLETED','DEPARTED',
                               'ARRIVED','DISEMBARKATION_COMPLETED','EXPECTED_TIME_CHANGED')
      )
    ) as x
    from public.journey_steps s
    where s.operation_id = _operation_id
      and s.traveler_facing = true
  ) t;
  return jsonb_build_object('operation_id', _operation_id, 'steps', _steps);
end; $$;

-- 6. SELF: own mobility
create or replace function public.get_my_mobility(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public'
as $$
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
  return jsonb_build_object('operation_id', _operation_id, 'legs', _legs);
end; $$;

-- 7. SELF: own stay
create or replace function public.get_my_stay(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public'
as $$
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
  return jsonb_build_object('operation_id', _operation_id, 'stays', _stays);
end; $$;

-- 8. SELF: participant-facing event program
create or replace function public.get_my_event_program(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public'
as $$
declare _ctx jsonb; _events jsonb;
begin
  _ctx := app_private.w10_assert_effective_access(_operation_id);
  select coalesce(jsonb_agg(x order by x->>'planned_start'), '[]'::jsonb) into _events
  from (
    select jsonb_build_object(
      'event_id', ev.id,
      'name', ev.name,
      'source_kind', ev.source_kind,
      'external_producer_name', ev.external_producer_name,
      'timezone', ev.timezone,
      'planned_start', ev.planned_start,
      'planned_end', ev.planned_end,
      'expected_start', ev.expected_start,
      'expected_end', ev.expected_end,
      'closed_out', (ev.closed_out_at is not null),
      'venue', case when v.id is null then null else jsonb_build_object(
          'name', v.name,
          'country_code', v.country_code,
          'region', v.region,
          'city', v.city,
          'address_label', v.address_label,
          'timezone', v.timezone) end,
      'sessions', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'session_id', ss.id,
                 'sequence', ss.sequence,
                 'title', ss.title,
                 'description', ss.description,
                 'session_kind', ss.session_kind,
                 'planned_start', ss.planned_start,
                 'planned_end', ss.planned_end,
                 'expected_start', ss.expected_start,
                 'expected_end', ss.expected_end,
                 'space', case when sp.id is null then null else jsonb_build_object(
                      'name', sp.name, 'space_label', sp.space_label,
                      'floor_label', sp.floor_label) end
               ) order by ss.sequence), '[]'::jsonb)
        from public.event_sessions ss
        left join public.venue_spaces sp on sp.id = ss.venue_space_id
        where ss.event_id = ev.id
          and ss.session_kind not in ('setup','teardown','rehearsal'))
    ) as x
    from public.events ev
    left join public.venues v on v.id = ev.venue_id
    where ev.operation_id = _operation_id
      and ev.status <> 'draft'
  ) t;
  return jsonb_build_object('operation_id', _operation_id, 'events', _events);
end; $$;

-- 9. SELF: own inbox for this operation
create or replace function public.get_my_messages(_operation_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public'
as $$
declare _ctx jsonb; _person uuid; _msgs jsonb;
begin
  _ctx := app_private.w10_assert_effective_access(_operation_id);
  _person := (_ctx->>'person_id')::uuid;
  select coalesce(jsonb_agg(x order by x->>'published_at' desc), '[]'::jsonb) into _msgs
  from (
    select jsonb_build_object(
      'message_id', m.id,
      'kind', m.kind,
      'priority', m.priority,
      'status', m.status,
      'title', m.title,
      'body', m.body,
      'locale', m.locale,
      'published_at', m.published_at,
      'cancelled_at', m.cancelled_at,
      'expires_at', m.expires_at,
      'journey_step_id', m.journey_step_id,
      'transport_leg_id', m.transport_leg_id,
      'hospitality_stay_id', m.hospitality_stay_id,
      'event_id', m.event_id,
      'event_session_id', m.event_session_id,
      'supersedes_message_id', m.supersedes_message_id,
      'my_first_read_at', r.first_read_at
    ) as x
    from public.message_recipients r
    join public.messages m on m.id = r.message_id and m.tenant_id = r.tenant_id
    where r.person_id = _person
      and m.operation_id = _operation_id
      and m.status in ('published','cancelled')
      and m.published_at is not null
      and (m.expires_at is null or m.expires_at > now())
  ) t;
  return jsonb_build_object('operation_id', _operation_id, 'messages', _msgs);
end; $$;

-- ACL: authenticated only
do $$
declare f text;
begin
  foreach f in array array[
    'public.list_participant_access_grants(uuid,uuid)',
    'public.get_my_participant_access()',
    'public.get_my_operations()',
    'public.get_my_operation_overview(uuid)',
    'public.get_my_journey(uuid)',
    'public.get_my_mobility(uuid)',
    'public.get_my_stay(uuid)',
    'public.get_my_event_program(uuid)',
    'public.get_my_messages(uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;