-- W06: expose the commercial accommodation preference in the stay guest read model.
-- Presentation only: no room is assigned and no hospitality rule changes.

create or replace function public.w06_stay_guests(_stay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'pg_catalog','public'
as $$
declare
  _stay public.hospitality_stays;
  _rows jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stay_participation_id', g.id,
        'participation_id', g.participation_id,
        'full_name', pe.full_name,
        'participation_kind', op.participation_kind,
        'participation_status', op.status,
        'accommodation_preference', coalesce(pref.accommodation_preference, 'Ainda não definida'),
        'is_active', g.is_active,
        'removal_reason', g.removal_reason,
        'state', app_private.w06_guest_state(g.id),
        'room_id', a.room_id,
        'room_label', r.label,
        'room_assignment_id', a.id
      )
      order by g.is_active desc, pe.full_name
    ),
    '[]'::jsonb
  )
  into _rows
  from public.hospitality_stay_participations g
  join public.operation_participations op on op.id = g.participation_id
  join public.people pe on pe.id = op.person_id
  left join lateral (
    select nullif(btrim(cl.metadata->>'accommodation_preference'), '') as accommodation_preference
    from public.commercial_leads cl
    where cl.tenant_id = op.tenant_id
      and cl.operation_id = op.operation_id
      and cl.converted_person_id = op.person_id
    order by cl.converted_at desc nulls last, cl.created_at desc
    limit 1
  ) pref on true
  left join public.hospitality_room_assignments a
    on a.stay_participation_id = g.id and a.released_at is null
  left join public.hospitality_rooms r on r.id = a.room_id
  where g.stay_id = _stay.id;

  return jsonb_build_object('stay_id', _stay.id, 'guests', _rows);
end;
$$;
