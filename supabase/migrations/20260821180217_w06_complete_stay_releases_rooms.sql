create or replace function public.complete_hospitality_stay(_stay_id uuid, _idempotency_key text, _note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _stay public.hospitality_stays;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _out jsonb;
  _a record;
begin
  _stay := app_private.w06_stay(_stay_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;

  _out := app_private.w06_replay('hospitality.stay.complete', _key);
  if _out is not null then return _out; end if;

  if _stay.status = 'completed' then
    _out := jsonb_build_object('stay_id', _stay_id, 'status', 'completed', 'unchanged', true);
    perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.complete', _key, _out);
    return _out;
  end if;

  if _stay.status <> 'active' then
    raise exception 'Only an active stay can be completed';
  end if;

  if _stay.checkout_completed_at is null then
    raise exception 'The stay check-out must be completed before the stay can be closed';
  end if;

  -- Group check-out already guarantees that every active guest has a resolved
  -- outcome (CHECKED_OUT or NO_SHOW). At final closure, release any remaining
  -- room assignments automatically instead of forcing a redundant manual step.
  for _a in
    select a.id as assignment_id, a.room_id, a.stay_participation_id
      from public.hospitality_room_assignments a
     where a.stay_id = _stay_id
       and a.released_at is null
     order by a.assigned_at, a.id
  loop
    perform set_config('app.w06_control','on', true);
    update public.hospitality_room_assignments
       set released_at = now(),
           released_by = auth.uid(),
           release_reason = 'Stay completed'
     where id = _a.assignment_id
       and released_at is null;
    perform set_config('app.w06_control','off', true);

    perform app_private.record_hospitality_event(
      _stay,
      'ROOM_RELEASED',
      _a.room_id,
      _a.stay_participation_id,
      _a.assignment_id,
      null,
      'Stay completed'
    );
  end loop;

  perform set_config('app.w06_control','on', true);
  update public.hospitality_stays
     set status = 'completed', completed_at = now()
   where id = _stay_id;
  perform set_config('app.w06_control','off', true);

  perform app_private.record_hospitality_event(_stay, 'STAY_COMPLETED', null, null, null, null, _note);
  perform app_private.record_audit_event(
    _stay.tenant_id,
    auth.uid(),
    'hospitality.stay.completed',
    'hospitality_stay',
    _stay_id,
    _key,
    '{}'::jsonb
  );

  _out := jsonb_build_object('stay_id', _stay_id, 'status', 'completed', 'unchanged', false);
  perform app_private.w06_claim_key(_stay.tenant_id, 'hospitality.stay.complete', _key, _out);
  return _out;
end;
$function$;