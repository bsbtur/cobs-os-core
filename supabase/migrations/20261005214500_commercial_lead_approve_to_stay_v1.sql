-- Explicit operator approval of a commercial lead into both roster and one selected stay.
-- The selected stay must belong to the same operation linked to the lead.
-- Room assignment remains a separate decision.

create or replace function public.approve_commercial_lead_to_operation_and_stay(
  _lead_id uuid,
  _stay_id uuid,
  _idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _lead public.commercial_leads;
  _stay public.hospitality_stays;
  _approved jsonb;
  _participation_id uuid;
  _guest jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select *
    into _lead
    from public.commercial_leads
   where id = _lead_id;

  if _lead.id is null then raise exception 'Commercial lead not found'; end if;
  if _lead.operation_id is null then raise exception 'Commercial lead is not linked to an operation'; end if;

  select *
    into _stay
    from public.hospitality_stays s
   where s.id = _stay_id
     and s.operation_id = _lead.operation_id
     and s.tenant_id = _lead.tenant_id;

  if _stay.id is null then
    raise exception 'Selected stay is not part of the lead operation';
  end if;

  _approved := public.approve_commercial_lead_to_operation(
    _lead_id,
    _key || ':roster'
  );

  _participation_id := nullif(_approved->>'participation_id', '')::uuid;
  if _participation_id is null then raise exception 'Lead approval did not return a participation'; end if;

  _guest := public.add_stay_participation(
    _stay.id,
    _participation_id,
    _key || ':stay',
    null
  );

  return jsonb_build_object(
    'lead_id', _lead.id,
    'person_id', _approved->>'person_id',
    'participation_id', _participation_id,
    'participation_status', coalesce(_approved->>'participation_status', 'expected'),
    'stay_id', _stay.id,
    'stay_participation_id', _guest->>'stay_participation_id',
    'room_assigned', false,
    'created', true
  );
end;
$$;

comment on function public.approve_commercial_lead_to_operation_and_stay(uuid,uuid,text) is
  'Explicit operator approval: converts lead to Person, adds expected operation participation, and adds the participant to one selected operation stay without assigning a room.';

revoke all on function public.approve_commercial_lead_to_operation_and_stay(uuid,uuid,text) from public, anon, service_role;
grant execute on function public.approve_commercial_lead_to_operation_and_stay(uuid,uuid,text) to authenticated;
