create or replace function app_private.w05_assert_open(_leg public.transport_legs)
returns void
language plpgsql
stable security definer
set search_path to 'pg_catalog','public'
as $function$
begin
  perform app_private.assert_operation_not_closed(_leg.operation_id);
  if app_private.w05_has_event(_leg.id, 'LEG_CANCELLED') then
    raise exception 'This transport leg was cancelled';
  end if;
  if app_private.w05_has_event(_leg.id, 'LEG_DEPARTED') then
    raise exception 'This transport leg already departed. Create a new ad-hoc leg instead of rewriting history.';
  end if;
end;
$function$;

create or replace function app_private.w06_assert_open(_stay public.hospitality_stays)
returns void
language plpgsql
stable security definer
set search_path to 'pg_catalog','public'
as $function$
begin
  perform app_private.assert_operation_not_closed(_stay.operation_id);
  if _stay.status in ('completed','cancelled') then
    raise exception 'This stay is closed and can no longer be changed';
  end if;
end;
$function$;

create or replace function app_private.record_journey_event(_op public.operations, _step_id uuid, _type public.journey_event_type, _occurred_at timestamptz, _note text default null, _context jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _id uuid; _at timestamptz;
begin
  perform app_private.assert_operation_not_closed(_op.id);
  _at := app_private.w04_assert_occurred_at(_op, _occurred_at);
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));
  perform set_config('app.w04_control','on', true);
  insert into public.journey_events
    (tenant_id, operation_id, journey_step_id, event_type, actor_profile_id,
     occurred_at, note, traveler_visible, context, correlation_id)
  values (_op.tenant_id, _op.id, _step_id, _type, auth.uid(), _at,
          nullif(btrim(coalesce(_note,'')),''),
          app_private.w04_traveler_visibility(_type)
            and coalesce((select s.traveler_facing from public.journey_steps s where s.id = _step_id), false),
          coalesce(_context,'{}'::jsonb), gen_random_uuid()::text)
  on conflict do nothing
  returning id into _id;
  perform set_config('app.w04_control','off', true);
  if _id is null then
    select e.id into _id from public.journey_events e
      where e.operation_id = _op.id and e.event_type = _type
        and e.journey_step_id is not distinct from _step_id
      limit 1;
  end if;
  return _id;
end;
$function$;

create or replace function app_private.record_transport_event(_leg public.transport_legs, _type public.transport_event_type, _occurred_at timestamptz default null, _note text default null, _context jsonb default '{}'::jsonb, _stop_id uuid default null, _subject_driver_id uuid default null, _subject_vehicle_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _id uuid; _at timestamptz := coalesce(_occurred_at, now()); _driver uuid; _vehicle uuid;
begin
  perform app_private.assert_operation_not_closed(_leg.operation_id);
  if _at > now() + interval '5 minutes' then raise exception 'A transport fact cannot be recorded in the future'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));
  if _type in ('VEHICLE_REQUESTED','VEHICLE_EN_ROUTE_TO_PICKUP','VEHICLE_AT_PICKUP','LEG_DEPARTED','STOP_REACHED','DESTINATION_ARRIVED','LEG_CANCELLED','TRANSPORT_INCIDENT_NOTED') then
    _driver := coalesce(_subject_driver_id, _leg.driver_id);
    _vehicle := coalesce(_subject_vehicle_id, _leg.vehicle_id);
  else
    _driver := _subject_driver_id; _vehicle := _subject_vehicle_id;
  end if;
  perform set_config('app.w05_control','on', true);
  insert into public.transport_events
    (tenant_id, operation_id, transport_leg_id, transport_leg_stop_id, event_type,
     actor_profile_id, occurred_at, note, context, correlation_id, subject_driver_id, subject_vehicle_id)
  values (_leg.tenant_id, _leg.operation_id, _leg.id, _stop_id, _type, auth.uid(), _at,
          nullif(btrim(coalesce(_note,'')),''), coalesce(_context,'{}'::jsonb), gen_random_uuid()::text, _driver, _vehicle)
  on conflict do nothing returning id into _id;
  perform set_config('app.w05_control','off', true);
  if _id is null then
    select e.id into _id from public.transport_events e
      where e.transport_leg_id = _leg.id and e.event_type = _type
        and e.transport_leg_stop_id is not distinct from _stop_id
      limit 1;
  end if;
  return _id;
end;
$function$;

create or replace function app_private.record_hospitality_event(_stay public.hospitality_stays, _type public.hospitality_event_type, _room_id uuid default null, _stay_participation_id uuid default null, _room_assignment_id uuid default null, _occurred_at timestamptz default null, _note text default null, _context jsonb default '{}'::jsonb, _correlation_id text default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _id uuid; _at timestamptz := coalesce(_occurred_at, now());
begin
  perform app_private.assert_operation_not_closed(_stay.operation_id);
  if _at > now() + interval '5 minutes' then raise exception 'A hospitality fact cannot be recorded in the future'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_note,'')),''));
  perform set_config('app.w06_control','on', true);
  insert into public.hospitality_events
    (tenant_id, operation_id, stay_id, room_id, stay_participation_id, room_assignment_id,
     event_type, actor_profile_id, occurred_at, note, context, correlation_id)
  values (_stay.tenant_id, _stay.operation_id, _stay.id, _room_id, _stay_participation_id,
          _room_assignment_id, _type, auth.uid(), _at,
          nullif(btrim(coalesce(_note,'')),''), coalesce(_context,'{}'::jsonb),
          coalesce(nullif(btrim(coalesce(_correlation_id,'')),''), gen_random_uuid()::text))
  returning id into _id;
  perform set_config('app.w06_control','off', true);
  return _id;
end;
$function$;

create or replace function public.link_transport_leg_to_journey_step(_transport_leg_id uuid, _journey_step_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _leg public.transport_legs;
begin
  _leg := app_private.w05_leg(_transport_leg_id);
  perform app_private.assert_operation_not_closed(_leg.operation_id);
  if _journey_step_id is not null and not exists (
      select 1 from public.journey_steps s where s.id = _journey_step_id and s.operation_id = _leg.operation_id) then
    raise exception 'That journey step does not belong to this operation';
  end if;
  perform set_config('app.w05_control','on', true);
  update public.transport_legs set journey_step_id = _journey_step_id where id = _leg.id;
  perform set_config('app.w05_control','off', true);
  perform app_private.record_audit_event(_leg.tenant_id, auth.uid(), 'transport.leg_linked_to_step', 'transport_leg', _leg.id, null,
    jsonb_build_object('previous_step_id', _leg.journey_step_id, 'journey_step_id', _journey_step_id));
  return jsonb_build_object('transport_leg_id', _leg.id, 'journey_step_id', _journey_step_id);
end;
$function$;

create or replace function public.create_hospitality_stay(_operation_id uuid, _property_id uuid, _name text, _planned_check_in timestamptz, _planned_check_out timestamptz, _idempotency_key text, _notes text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _op public.operations; _prop public.hospitality_properties; _row public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  perform app_private.w06_assert_role(_op.tenant_id);
  perform app_private.assert_operation_not_closed(_op.id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.create', _key);
  if _out is not null then return _out; end if;
  select * into _prop from public.hospitality_properties p where p.id = _property_id and p.tenant_id = _op.tenant_id;
  if _prop.id is null then raise exception 'Property not found in this organization'; end if;
  if not _prop.is_active then raise exception 'This property is retired'; end if;
  if _planned_check_out <= _planned_check_in then raise exception 'Check-out must be after check-in'; end if;
  perform app_private.assert_generic_note(nullif(btrim(coalesce(_notes,'')),''));
  perform set_config('app.w06_control','on', true);
  insert into public.hospitality_stays
    (tenant_id, operation_id, property_id, name, planned_check_in, planned_check_out, notes, created_by)
  values (_op.tenant_id, _op.id, _prop.id, coalesce(nullif(btrim(coalesce(_name,'')),''), _prop.name),
          _planned_check_in, _planned_check_out, nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  returning * into _row;
  perform set_config('app.w06_control','off', true);
  perform app_private.record_audit_event(_op.tenant_id, auth.uid(), 'hospitality.stay.created', 'hospitality_stay', _row.id, _key, jsonb_build_object('property_id', _prop.id));
  _out := jsonb_build_object('stay_id', _row.id, 'operation_id', _op.id, 'tenant_id', _op.tenant_id);
  perform app_private.w06_claim_key(_op.tenant_id, 'hospitality.stay.create', _key, _out);
  return _out;
end;
$function$;

create or replace function public.set_stay_planned_window(_stay_id uuid, _planned_check_in timestamptz, _planned_check_out timestamptz, _idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  perform app_private.assert_operation_not_closed(_stay.operation_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.planned', _key);
  if _out is not null then return _out; end if;
  if _stay.status <> 'draft' then raise exception 'The stay baseline is frozen once confirmed. Use the expected window instead.'; end if;
  if _planned_check_out <= _planned_check_in then raise exception 'Check-out must be after check-in'; end if;
  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays set planned_check_in = _planned_check_in, planned_check_out = _planned_check_out where id = _stay_id;
  perform set_config('app.w06_control','off', true);
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.stay.planned_window', 'hospitality_stay', _stay_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_id', _stay_id);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.planned', _key, _out);
  return _out;
end;
$function$;

create or replace function public.retract_presence_fact(_presence_fact_id uuid, _reason text, _idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _uid uuid := auth.uid(); _orig public.participant_presence_events; _op public.operations;
  _why text := nullif(btrim(coalesce(_reason,'')),''); _existing jsonb; _id uuid; _result jsonb;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _idempotency_key is null then raise exception 'An idempotency key is required'; end if;
  if _why is null then raise exception 'A reason is required to retract a presence record'; end if;
  perform app_private.assert_generic_note(_why);
  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = _uid and k.action = 'presence.retract' and k.idempotency_key = _idempotency_key::text;
  if _existing is not null then return _existing; end if;
  select * into _orig from public.participant_presence_events e where e.id = _presence_fact_id;
  if _orig.id is null or not app_private.has_tenant_role(_orig.tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Presence record not found';
  end if;
  if _orig.presence_fact = 'PRESENCE_RETRACTED' then raise exception 'A retraction cannot itself be retracted'; end if;
  if exists (select 1 from public.participant_presence_events r where r.retracts_presence_event_id = _orig.id) then
    raise exception 'This presence record has already been retracted';
  end if;
  select * into _op from public.operations o where o.id = _orig.operation_id;
  if _op.status not in ('ready','active') then
    raise exception 'Presence can only be corrected while the operation is ready or running';
  end if;
  perform set_config('app.w04_control','on', true);
  insert into public.participant_presence_events
    (tenant_id, operation_id, participation_id, journey_step_id, presence_fact, actor_profile_id, occurred_at, note, context, correlation_id, retracts_presence_event_id)
  values (_orig.tenant_id, _orig.operation_id, _orig.participation_id, _orig.journey_step_id,
    'PRESENCE_RETRACTED', _uid, now(), _why,
    jsonb_build_object('reason', _why, 'retracted_presence_event_id', _orig.id, 'retracted_presence_fact', _orig.presence_fact),
    gen_random_uuid()::text, _orig.id)
  returning id into _id;
  perform set_config('app.w04_control','off', true);
  perform app_private.record_audit_event(_orig.tenant_id, _uid, 'presence.retracted', 'participant_presence_event', _orig.id, _idempotency_key::text,
    jsonb_build_object('operation_id', _orig.operation_id, 'journey_step_id', _orig.journey_step_id,
                       'participation_id', _orig.participation_id, 'retracted_presence_fact', _orig.presence_fact,
                       'retraction_event_id', _id, 'reason', _why));
  _result := jsonb_build_object('retracted_presence_event_id', _orig.id, 'retraction_event_id', _id,
                                'presence_fact', _orig.presence_fact, 'journey_step_id', _orig.journey_step_id);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_orig.tenant_id, _uid, 'presence.retract', _idempotency_key::text, _result);
  return _result;
end;
$function$;