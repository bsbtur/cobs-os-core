create or replace function app_private.assistant_build_trusted_context(
  _tenant_id uuid,
  _operation_id uuid,
  _profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _o public.operations%rowtype;
  _grant public.participant_access_grants%rowtype;
  _journey jsonb := '[]'::jsonb;
  _transport jsonb := '[]'::jsonb;
  _hospitality jsonb := '[]'::jsonb;
  _events jsonb := '[]'::jsonb;
  _known jsonb := '[]'::jsonb;
begin
  select * into _o from public.operations where id = _operation_id and tenant_id = _tenant_id;
  if _o.id is null then raise exception 'operation_not_found'; end if;
  if not app_private.assistant_has_operation_access(_tenant_id, _operation_id, _profile_id) then raise exception 'operation_access_denied'; end if;
  select * into _grant from public.participant_access_grants g where g.tenant_id = _tenant_id and g.operation_id = _operation_id and g.profile_id = _profile_id and g.status::text = 'active' and g.revoked_at is null order by g.activated_at desc nulls last, g.granted_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('sequence',j.sequence,'title',j.title,'traveler_label',j.traveler_label,'planned_start',j.planned_start,'planned_end',j.planned_end,'expected_start',j.expected_start,'expected_end',j.expected_end,'location',j.location_label)) order by j.sequence),'[]'::jsonb) into _journey from public.journey_steps j where j.tenant_id = _tenant_id and j.operation_id = _operation_id and j.traveler_facing is true and j.archived_at is null;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('sequence',t.sequence,'title',t.title,'origin',t.origin_label,'destination',t.destination_label,'planned_departure',t.planned_departure,'expected_departure',t.expected_departure,'planned_arrival',t.planned_arrival,'expected_arrival',t.expected_arrival,'return_time',t.return_time,'return_time_note',t.return_time_note)) order by t.sequence),'[]'::jsonb) into _transport from public.transport_legs t where t.tenant_id = _tenant_id and t.operation_id = _operation_id;
  if _grant.participation_id is not null then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('stay_name',s.name,'property_name',p.name,'city',p.city,'address',p.address_label,'planned_check_in',s.planned_check_in,'expected_check_in',s.expected_check_in,'planned_check_out',s.planned_check_out,'expected_check_out',s.expected_check_out,'room',r.label))),'[]'::jsonb) into _hospitality from public.hospitality_stay_participations sp join public.hospitality_stays s on s.id=sp.stay_id and s.tenant_id=sp.tenant_id left join public.hospitality_properties p on p.id=s.property_id and p.tenant_id=s.tenant_id left join public.hospitality_room_assignments ra on ra.stay_participation_id=sp.id and ra.tenant_id=sp.tenant_id and ra.released_at is null left join public.hospitality_rooms r on r.id=ra.room_id and r.tenant_id=ra.tenant_id where sp.tenant_id=_tenant_id and sp.participation_id=_grant.participation_id and sp.is_active is true and sp.removed_at is null;
  end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name',e.name,'status',e.status::text,'timezone',e.timezone,'schedule_precision',e.schedule_precision,'venue_name',v.name,'venue_city',v.city,'venue_region',v.region,'venue_address',v.address_label,'planned_start',case when e.schedule_precision='date_only' then null else e.planned_start end,'planned_end',case when e.schedule_precision='date_only' then null else e.planned_end end,'planned_start_date',case when e.schedule_precision='date_only' and e.planned_start is not null then (e.planned_start at time zone coalesce(e.timezone,_o.timezone,'UTC'))::date else null end,'planned_end_date',case when e.schedule_precision='date_only' and e.planned_end is not null then (e.planned_end at time zone coalesce(e.timezone,_o.timezone,'UTC'))::date else null end,'expected_start',case when e.schedule_precision='date_only' then null else e.expected_start end,'expected_end',case when e.schedule_precision='date_only' then null else e.expected_end end,'time_status',case when e.schedule_precision='date_only' then 'to_be_confirmed' else 'confirmed_datetime' end)) order by coalesce(e.expected_start,e.planned_start)),'[]'::jsonb) into _events from public.events e left join public.venues v on v.id=e.venue_id and v.tenant_id=e.tenant_id where e.tenant_id=_tenant_id and e.operation_id=_operation_id;
  if _o.planned_start is not null then _known := _known || jsonb_build_array(jsonb_build_object('fact','operation_planned_start','value',_o.planned_start)); end if;
  if _o.planned_end is not null then _known := _known || jsonb_build_array(jsonb_build_object('fact','operation_planned_end','value',_o.planned_end)); end if;
  return jsonb_build_object('operation',jsonb_strip_nulls(jsonb_build_object('name',_o.name,'code',_o.code,'timezone',_o.timezone,'planned_start',_o.planned_start,'planned_end',_o.planned_end,'expected_start',_o.expected_start,'expected_end',_o.expected_end)),'reservation','{}'::jsonb,'payment','{}'::jsonb,'schedule',jsonb_build_object('journey',_journey,'transport',_transport,'events',_events),'hospitality',_hospitality,'documents','{}'::jsonb,'known_facts',_known);
end;
$function$;