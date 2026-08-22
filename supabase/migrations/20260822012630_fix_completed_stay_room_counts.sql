create or replace function public.w06_stay_overview(_stay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare _stay public.hospitality_stays; _prop public.hospitality_properties; _counts jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  select * into _prop from public.hospitality_properties p where p.id = _stay.property_id;

  select jsonb_build_object(
    'guests', count(*) filter (where g.is_active),
    'removed', count(*) filter (where not g.is_active),
    'with_room', count(*) filter (
      where g.is_active and (
        case
          when _stay.status = 'completed' then exists (
            select 1 from public.hospitality_room_assignments a
             where a.stay_participation_id = g.id
          )
          else exists (
            select 1 from public.hospitality_room_assignments a
             where a.stay_participation_id = g.id and a.released_at is null
          )
        end
      )
    ),
    'without_room', count(*) filter (
      where g.is_active
        and _stay.status not in ('completed','cancelled')
        and not exists (
          select 1 from public.hospitality_room_assignments a
           where a.stay_participation_id = g.id and a.released_at is null
        )
    ),
    'checked_in', count(*) filter (where g.is_active and app_private.w06_guest_state(g.id) = 'CHECKED_IN'),
    'checked_out', count(*) filter (where g.is_active and app_private.w06_guest_state(g.id) = 'CHECKED_OUT'),
    'no_show', count(*) filter (where g.is_active and app_private.w06_guest_state(g.id) = 'NO_SHOW'),
    'pending_checkin', count(*) filter (
      where g.is_active
        and _stay.status not in ('completed','cancelled')
        and app_private.w06_guest_state(g.id) = 'NOT_ARRIVED'
    )
  ) into _counts
  from public.hospitality_stay_participations g
  where g.stay_id = _stay.id;

  return jsonb_build_object(
    'stay_id', _stay.id, 'tenant_id', _stay.tenant_id, 'operation_id', _stay.operation_id,
    'name', _stay.name, 'status', _stay.status,
    'planned_check_in', _stay.planned_check_in, 'planned_check_out', _stay.planned_check_out,
    'expected_check_in', _stay.expected_check_in, 'expected_check_out', _stay.expected_check_out,
    'checkin_opened_at', _stay.checkin_opened_at,
    'checkout_completed_at', _stay.checkout_completed_at,
    'completed_at', _stay.completed_at, 'cancelled_at', _stay.cancelled_at,
    'cancellation_reason', _stay.cancellation_reason, 'notes', _stay.notes,
    'property', jsonb_build_object('property_id', _prop.id, 'name', _prop.name,
      'property_kind', _prop.property_kind, 'city', _prop.city, 'region', _prop.region,
      'country_code', _prop.country_code, 'address_label', _prop.address_label,
      'contact_label', _prop.contact_label),
    'counts', coalesce(_counts, '{}'::jsonb),
    'issues', (select count(*) from public.hospitality_events e
                where e.stay_id = _stay.id and e.event_type = 'HOSPITALITY_ISSUE_NOTED'));
end;
$function$;