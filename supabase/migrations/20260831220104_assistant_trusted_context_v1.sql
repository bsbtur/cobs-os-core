create or replace function app_private.assistant_build_trusted_context(
  _tenant_id uuid,
  _operation_id uuid,
  _profile_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _o public.operations%rowtype;
  _grant public.participant_access_grants%rowtype;
  _journey jsonb := '[]'::jsonb;
  _transport jsonb := '[]'::jsonb;
  _hospitality jsonb := '[]'::jsonb;
  _events jsonb := '[]'::jsonb;
  _known jsonb := '[]'::jsonb;
begin
  select * into _o from public.operations where id=_operation_id and tenant_id=_tenant_id;
  if _o.id is null then raise exception 'operation_not_found'; end if;

  if not app_private.assistant_has_operation_access(_tenant_id,_operation_id,_profile_id) then
    raise exception 'operation_access_denied';
  end if;

  select * into _grant
  from public.participant_access_grants g
  where g.tenant_id=_tenant_id and g.operation_id=_operation_id and g.profile_id=_profile_id
    and g.status::text='active' and g.revoked_at is null
  order by g.activated_at desc nulls last, g.granted_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'sequence',j.sequence,'title',j.title,'traveler_label',j.traveler_label,
    'planned_start',j.planned_start,'planned_end',j.planned_end,
    'expected_start',j.expected_start,'expected_end',j.expected_end,
    'location',j.location_label
  )) order by j.sequence),'[]'::jsonb) into _journey
  from public.journey_steps j
  where j.tenant_id=_tenant_id and j.operation_id=_operation_id
    and j.traveler_facing is true and j.archived_at is null;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'sequence',t.sequence,'title',t.title,'origin',t.origin_label,'destination',t.destination_label,
    'planned_departure',t.planned_departure,'expected_departure',t.expected_departure,
    'planned_arrival',t.planned_arrival,'expected_arrival',t.expected_arrival,
    'return_time',t.return_time,'return_time_note',t.return_time_note
  )) order by t.sequence),'[]'::jsonb) into _transport
  from public.transport_legs t
  where t.tenant_id=_tenant_id and t.operation_id=_operation_id;

  if _grant.participation_id is not null then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'stay_name',s.name,'property_name',p.name,'city',p.city,'address',p.address_label,
      'planned_check_in',s.planned_check_in,'expected_check_in',s.expected_check_in,
      'planned_check_out',s.planned_check_out,'expected_check_out',s.expected_check_out,
      'room',r.label
    ))),'[]'::jsonb) into _hospitality
    from public.hospitality_stay_participations sp
    join public.hospitality_stays s on s.id=sp.stay_id and s.tenant_id=sp.tenant_id
    left join public.hospitality_properties p on p.id=s.property_id and p.tenant_id=s.tenant_id
    left join public.hospitality_room_assignments ra on ra.stay_participation_id=sp.id and ra.tenant_id=sp.tenant_id and ra.released_at is null
    left join public.hospitality_rooms r on r.id=ra.room_id and r.tenant_id=ra.tenant_id
    where sp.tenant_id=_tenant_id and sp.participation_id=_grant.participation_id
      and sp.is_active is true and sp.removed_at is null;
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'name',e.name,'status',e.status::text,'timezone',e.timezone,
    'planned_start',e.planned_start,'planned_end',e.planned_end,
    'expected_start',e.expected_start,'expected_end',e.expected_end
  )) order by coalesce(e.expected_start,e.planned_start)),'[]'::jsonb) into _events
  from public.events e
  where e.tenant_id=_tenant_id and e.operation_id=_operation_id;

  if _o.planned_start is not null then _known := _known || jsonb_build_array(jsonb_build_object('fact','operation_planned_start','value',_o.planned_start)); end if;
  if _o.planned_end is not null then _known := _known || jsonb_build_array(jsonb_build_object('fact','operation_planned_end','value',_o.planned_end)); end if;

  return jsonb_build_object(
    'operation',jsonb_strip_nulls(jsonb_build_object('name',_o.name,'code',_o.code,'timezone',_o.timezone,'planned_start',_o.planned_start,'planned_end',_o.planned_end,'expected_start',_o.expected_start,'expected_end',_o.expected_end)),
    'reservation','{}'::jsonb,
    'payment','{}'::jsonb,
    'schedule',jsonb_build_object('journey',_journey,'transport',_transport,'events',_events),
    'hospitality',_hospitality,
    'documents','{}'::jsonb,
    'known_facts',_known
  );
end;
$$;

revoke all on function app_private.assistant_build_trusted_context(uuid,uuid,uuid) from public;

create or replace function public.assistant_submit_message(_conversation_id uuid, _message text, _human_available boolean default false, _idempotency_key text default null)
returns table(message_id uuid, automation_event_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _c public.assistant_conversations%rowtype;
  _message_id uuid;
  _event_id uuid;
  _idem text;
  _person_id uuid;
  _trusted_context jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if _message is null or length(btrim(_message)) < 1 or length(_message) > 2000 then raise exception 'invalid_message'; end if;

  select * into _c from public.assistant_conversations where id=_conversation_id;
  if _c.id is null then raise exception 'conversation_not_found'; end if;
  if _c.profile_id <> auth.uid() then raise exception 'assistant_access_denied'; end if;
  if _c.status <> 'open' then raise exception 'conversation_closed'; end if;
  if not app_private.assistant_has_operation_access(_c.tenant_id,_c.operation_id,_c.profile_id) then raise exception 'operation_access_denied'; end if;

  select g.person_id into _person_id from public.participant_access_grants g
  where g.tenant_id=_c.tenant_id and g.operation_id=_c.operation_id and g.profile_id=_c.profile_id
    and g.status::text='active' and g.revoked_at is null
  order by g.activated_at desc nulls last, g.granted_at desc limit 1;

  _trusted_context := app_private.assistant_build_trusted_context(_c.tenant_id,_c.operation_id,_c.profile_id);

  insert into public.assistant_conversation_messages(conversation_id,tenant_id,role,content,status)
  values (_c.id,_c.tenant_id,'user',btrim(_message),'completed') returning id into _message_id;

  _idem := coalesce(nullif(btrim(_idempotency_key),''),'assistant.request:'||_message_id::text);

  insert into public.automation_events(tenant_id,operation_id,actor_profile_id,event_type,source,idempotency_key,correlation_id,payload,dispatch_status)
  values (_c.tenant_id,_c.operation_id,_c.profile_id,'assistant.request','cobs_app',_idem,
    'assistant:'||_c.id::text||':'||_message_id::text,
    jsonb_build_object('message',btrim(_message),'channel',_c.channel,'locale',_c.locale,
      'human_available',coalesce(_human_available,false),'conversation_id',_c.id::text,
      'person_id',_person_id,'context',_trusted_context),
    'pending') returning id into _event_id;

  update public.assistant_conversation_messages set automation_event_id=_event_id,status='pending' where id=_message_id;
  update public.assistant_conversations set human_available=coalesce(_human_available,false),last_message_at=now(),updated_at=now() where id=_c.id;
  return query select _message_id,_event_id;
end;
$$;

revoke all on function public.assistant_submit_message(uuid,text,boolean,text) from public;
grant execute on function public.assistant_submit_message(uuid,text,boolean,text) to authenticated;