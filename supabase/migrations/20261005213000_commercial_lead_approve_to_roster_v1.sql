-- Team Seffrin / generic commercial lead approval into an operation roster.
-- Converts the commercial lead to Person through the existing approved command,
-- then adds that Person as an expected participant through the existing W03 command.
-- It never creates an order, payment, reservation, portal access or hospitality assignment.

create or replace function public.approve_commercial_lead_to_operation(
  _lead_id uuid,
  _idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _lead public.commercial_leads;
  _conversion jsonb;
  _person_id uuid;
  _existing public.operation_participations;
  _added jsonb;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select *
    into _lead
    from public.commercial_leads
   where id = _lead_id
   for update;

  if _lead.id is null then raise exception 'Commercial lead not found'; end if;
  if _lead.operation_id is null then raise exception 'Commercial lead is not linked to an operation'; end if;

  perform app_private.w09_require_commerce_manager(_lead.tenant_id);

  if not app_private.has_tenant_role(
    _lead.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then
    raise exception 'You do not have permission to change this roster';
  end if;

  _conversion := public.convert_commercial_lead_to_person(_lead.id);
  _person_id := nullif(_conversion->>'person_id', '')::uuid;

  if _person_id is null then raise exception 'Lead conversion did not return a person'; end if;

  select *
    into _existing
    from public.operation_participations p
   where p.operation_id = _lead.operation_id
     and p.person_id = _person_id;

  if _existing.id is not null then
    return jsonb_build_object(
      'lead_id', _lead.id,
      'person_id', _person_id,
      'participation_id', _existing.id,
      'participation_status', _existing.status,
      'created', false,
      'unchanged', true
    );
  end if;

  _added := public.add_operation_participation(
    _lead.operation_id,
    _person_id,
    'participant'::public.participation_kind,
    _key || ':participation',
    '{}'::uuid[],
    null,
    null
  );

  return jsonb_build_object(
    'lead_id', _lead.id,
    'person_id', _person_id,
    'participation_id', _added->>'participation_id',
    'participation_status', 'expected',
    'created', true,
    'unchanged', false
  );
end;
$$;

comment on function public.approve_commercial_lead_to_operation(uuid,text) is
  'Explicit operator approval: converts a commercial lead to Person and adds that Person to the lead operation roster as an expected participant. No order, payment, reservation, portal access or hospitality assignment is created.';

revoke all on function public.approve_commercial_lead_to_operation(uuid,text) from public, anon, service_role;
grant execute on function public.approve_commercial_lead_to_operation(uuid,text) to authenticated;
