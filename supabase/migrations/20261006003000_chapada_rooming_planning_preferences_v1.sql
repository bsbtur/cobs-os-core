-- Chapada Experience 2027: planning-only accommodation preferences.
-- This migration records rooming intent without creating rooms or room assignments.

create or replace function public.set_stay_accommodation_preference(
  _stay_participation_id uuid,
  _preference text,
  _idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $$
declare
  _g public.hospitality_stay_participations;
  _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _pref text := lower(nullif(btrim(coalesce(_preference,'')),''));
  _out jsonb;
begin
  _g := app_private.w06_stay_participation(_stay_participation_id);
  _stay := app_private.w06_stay(_g.stay_id);
  perform app_private.w06_assert_open(_stay);

  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.guest.accommodation_preference', _key);
  if _out is not null then return _out; end if;

  if _pref not in ('share_with_men','share_with_women','couple','family_companion','unspecified') then
    raise exception 'Invalid accommodation preference';
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stay_participations
     set metadata = coalesce(metadata,'{}'::jsonb)
       || jsonb_build_object(
            'rooming_preference', _pref,
            'rooming_preference_source', 'operator_planning'
          )
   where id = _g.id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_audit_event(
    _g.tenant_id,
    auth.uid(),
    'hospitality.guest.accommodation_preference_set',
    'hospitality_stay_participation',
    _g.id,
    _key,
    jsonb_build_object(
      'stay_id', _g.stay_id,
      'rooming_preference', _pref,
      'planning_only', true,
      'room_assignment_created', false
    )
  );

  _out := jsonb_build_object(
    'stay_participation_id', _g.id,
    'stay_id', _g.stay_id,
    'rooming_preference', _pref,
    'planning_only', true,
    'room_assignment_created', false
  );
  perform app_private.w06_claim_key(
    _g.tenant_id,
    'hospitality.guest.accommodation_preference',
    _key,
    _out
  );
  return _out;
end;
$$;

revoke all on function public.set_stay_accommodation_preference(uuid,text,text)
from public, anon, service_role;
grant execute on function public.set_stay_accommodation_preference(uuid,text,text)
to authenticated;

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
        'rooming_preference_code',
          coalesce(
            nullif(g.metadata->>'rooming_preference',''),
            case
              when lower(coalesce(pref.accommodation_preference,'')) = 'casal' then 'couple'
              when lower(coalesce(pref.accommodation_preference,'')) in ('acompanhante / família','acompanhante / familia') then 'family_companion'
              else 'unspecified'
            end
          ),
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

do $$
declare
  _stay public.hospitality_stays;
begin
  select s.* into _stay
  from public.hospitality_stays s
  join public.operations o on o.id = s.operation_id
  join public.hospitality_properties p on p.id = s.property_id
  where o.code = 'CHAPADA-EXPERIENCE-20270615'
    and o.archived_at is null
    and p.name = 'Woodstock Guesthouse'
    and s.status <> 'cancelled'
  order by s.created_at desc
  limit 1;

  if _stay.id is null then
    raise notice 'Chapada Woodstock stay not present; skipping rooming policy metadata.';
    return;
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays
     set metadata = coalesce(metadata,'{}'::jsonb)
       || jsonb_build_object(
            'rooming_planning_policy',
            jsonb_build_object(
              'mode','planning_only',
              'men','share_with_men',
              'women','share_with_women',
              'couples','keep_together',
              'family_companion','keep_together_when_declared',
              'assignment_gate','supplier_inventory_confirmation_required'
            )
          )
   where id = _stay.id;
  perform set_config('app.w06_control','off', true);
end;
$$;
