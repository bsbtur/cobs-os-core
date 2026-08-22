create or replace function public.cancel_hospitality_stay(_stay_id uuid, _reason text, _idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _stay public.hospitality_stays; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _why text := nullif(btrim(coalesce(_reason,'')),''); _out jsonb;
begin
  _stay := app_private.w06_stay(_stay_id);
  perform app_private.assert_operation_not_closed(_stay.operation_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out := app_private.w06_replay('hospitality.stay.cancel', _key);
  if _out is not null then return _out; end if;
  if _stay.status = 'cancelled' then
    _out := jsonb_build_object('stay_id', _stay_id, 'status', 'cancelled', 'unchanged', true);
    perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.cancel', _key, _out);
    return _out;
  end if;
  if _stay.status = 'completed' then raise exception 'A completed stay cannot be cancelled'; end if;
  if _why is null then raise exception 'A reason is required to cancel a stay'; end if;
  perform app_private.assert_generic_note(_why);
  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays set status='cancelled', cancelled_at=now(), cancellation_reason=_why where id=_stay_id;
  update public.hospitality_room_assignments set released_at=now(), released_by=auth.uid(), release_reason='Stay cancelled' where stay_id=_stay_id and released_at is null;
  perform set_config('app.w06_control','off', true);
  perform app_private.record_hospitality_event(_stay,'STAY_CANCELLED',null,null,null,null,_why);
  perform app_private.record_audit_event(_stay.tenant_id,auth.uid(),'hospitality.stay.cancelled','hospitality_stay',_stay_id,_key,jsonb_build_object('reason',_why));
  _out := jsonb_build_object('stay_id',_stay_id,'status','cancelled','unchanged',false);
  perform app_private.w06_claim_key(_stay.tenant_id,'hospitality.stay.cancel',_key,_out);
  return _out;
end;
$function$;

create or replace function public.confirm_hospitality_stay(_stay_id uuid, _idempotency_key text, _note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _stay public.hospitality_stays; _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _stay:=app_private.w06_stay(_stay_id);
  perform app_private.assert_operation_not_closed(_stay.operation_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out:=app_private.w06_replay('hospitality.stay.confirm',_key); if _out is not null then return _out; end if;
  if _stay.status <> 'draft' then
    if _stay.status='confirmed' then
      _out:=jsonb_build_object('stay_id',_stay_id,'status','confirmed','unchanged',true);
      perform app_private.w06_claim_key(_stay.tenant_id,'hospitality.stay.confirm',_key,_out); return _out;
    end if;
    raise exception 'Only a draft stay can be confirmed';
  end if;
  perform set_config('app.w06_control','on',true);
  update public.hospitality_stays set status='confirmed' where id=_stay_id;
  perform set_config('app.w06_control','off',true);
  perform app_private.record_hospitality_event(_stay,'STAY_CONFIRMED',null,null,null,null,_note);
  perform app_private.record_audit_event(_stay.tenant_id,auth.uid(),'hospitality.stay.confirmed','hospitality_stay',_stay_id,_key,'{}'::jsonb);
  _out:=jsonb_build_object('stay_id',_stay_id,'status','confirmed','unchanged',false);
  perform app_private.w06_claim_key(_stay.tenant_id,'hospitality.stay.confirm',_key,_out); return _out;
end;
$function$;

create or replace function public.open_stay_checkin(_stay_id uuid, _idempotency_key text, _occurred_at timestamptz default null, _note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _stay public.hospitality_stays; _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _out jsonb;
begin
  _stay:=app_private.w06_stay(_stay_id);
  perform app_private.assert_operation_not_closed(_stay.operation_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  _out:=app_private.w06_replay('hospitality.stay.open_checkin',_key); if _out is not null then return _out; end if;
  if _stay.status='active' then
    _out:=jsonb_build_object('stay_id',_stay_id,'status','active','unchanged',true);
    perform app_private.w06_claim_key(_stay.tenant_id,'hospitality.stay.open_checkin',_key,_out); return _out;
  end if;
  if _stay.status <> 'confirmed' then raise exception 'Check-in can only be opened for a confirmed stay'; end if;
  perform set_config('app.w06_control','on',true);
  update public.hospitality_stays set status='active', checkin_opened_at=coalesce(_occurred_at,now()) where id=_stay_id;
  perform set_config('app.w06_control','off',true);
  perform app_private.record_hospitality_event(_stay,'STAY_CHECKIN_OPENED',null,null,null,_occurred_at,_note);
  perform app_private.record_audit_event(_stay.tenant_id,auth.uid(),'hospitality.stay.checkin_opened','hospitality_stay',_stay_id,_key,'{}'::jsonb);
  _out:=jsonb_build_object('stay_id',_stay_id,'status','active','unchanged',false);
  perform app_private.w06_claim_key(_stay.tenant_id,'hospitality.stay.open_checkin',_key,_out); return _out;
end;
$function$;