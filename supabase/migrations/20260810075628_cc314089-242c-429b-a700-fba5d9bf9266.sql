CREATE OR REPLACE FUNCTION public.note_hospitality_issue(_stay_id uuid, _note text, _idempotency_key text, _room_id uuid DEFAULT NULL::uuid, _stay_participation_id uuid DEFAULT NULL::uuid, _occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _text text := nullif(btrim(coalesce(_note,'')),''); _out jsonb; _event uuid;
begin
  _stay := app_private.w06_stay(_stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.issue.note', _key);
  if _out is not null then return _out; end if;
  perform app_private.w06_assert_open(_stay);
  if _text is null then raise exception 'Describe the issue'; end if;
  perform app_private.assert_generic_note(_text);
  if _room_id is not null then
    perform 1 from public.hospitality_rooms r where r.id = _room_id and r.stay_id = _stay.id;
    if not found then raise exception 'Room not found in this stay'; end if;
  end if;
  if _stay_participation_id is not null then
    perform 1 from public.hospitality_stay_participations g
      where g.id = _stay_participation_id and g.stay_id = _stay.id;
    if not found then raise exception 'Guest not found in this stay'; end if;
  end if;

  _event := app_private.record_hospitality_event(_stay, 'HOSPITALITY_ISSUE_NOTED', _room_id,
    _stay_participation_id, null, _occurred_at, _text);
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.issue.noted',
    'hospitality_event', _event, _key, '{}'::jsonb);
  _out := jsonb_build_object('hospitality_event_id', _event, 'stay_id', _stay.id);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.issue.note', _key, _out);
  return _out;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_stay_checkout(_stay_id uuid, _idempotency_key text, _occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
  _checked_in integer; _not_arrived integer; _checked_out integer; _no_show integer; _unresolved integer;
begin
  _stay := app_private.w06_stay(_stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.checkout', _key);
  if _out is not null then return _out; end if;
  if _stay.checkout_completed_at is not null then
    _out := jsonb_build_object('stay_id', _stay_id, 'unchanged', true);
    perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.checkout', _key, _out);
    return _out;
  end if;
  if _stay.status <> 'active' then
    raise exception 'Only an active stay can complete its check-out';
  end if;

  select
    count(*) filter (where s = 'CHECKED_IN'),
    count(*) filter (where s = 'NOT_ARRIVED'),
    count(*) filter (where s = 'CHECKED_OUT'),
    count(*) filter (where s = 'NO_SHOW')
    into _checked_in, _not_arrived, _checked_out, _no_show
  from (
    select app_private.w06_guest_state(g.id) as s
      from public.hospitality_stay_participations g
     where g.stay_id = _stay_id and g.is_active
  ) q;

  _unresolved := coalesce(_checked_in,0) + coalesce(_not_arrived,0);
  if _unresolved > 0 then
    raise exception 'Resolve every guest outcome before completing the stay check-out: % still checked in, % never arrived.',
      coalesce(_checked_in,0), coalesce(_not_arrived,0)
      using detail = jsonb_build_object(
        'code', 'W06_UNRESOLVED_GUESTS',
        'checked_in', coalesce(_checked_in,0),
        'not_arrived', coalesce(_not_arrived,0),
        'checked_out', coalesce(_checked_out,0),
        'no_show', coalesce(_no_show,0),
        'unresolved_total', _unresolved
      )::text;
  end if;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays
     set checkout_completed_at = coalesce(_occurred_at, now())
   where id = _stay_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'STAY_CHECKOUT_COMPLETED', null, null, null,
    _occurred_at, _note);
  perform app_private.record_audit_event(_stay.tenant_id, auth.uid(), 'hospitality.stay.checkout_completed',
    'hospitality_stay', _stay_id, _key, '{}'::jsonb);
  _out := jsonb_build_object('stay_id', _stay_id, 'unchanged', false,
    'checked_out', coalesce(_checked_out,0), 'no_show', coalesce(_no_show,0),
    'checked_in', 0, 'not_arrived', 0, 'unresolved_total', 0);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.checkout', _key, _out);
  return _out;
end;
$function$;