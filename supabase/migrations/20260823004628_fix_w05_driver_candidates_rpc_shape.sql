drop function if exists public.w05_operation_driver_candidates(uuid);

create function public.w05_operation_driver_candidates(_operation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _tenant_id uuid;
  _candidates jsonb;
begin
  select o.tenant_id into _tenant_id
  from public.operations o
  where o.id = _operation_id;

  if _tenant_id is null then
    raise exception 'Operation not found';
  end if;

  perform app_private.w05_assert_role(_tenant_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'person_id', q.person_id,
        'participation_id', q.participation_id,
        'full_name', q.full_name,
        'participation_kind', q.participation_kind,
        'participation_status', q.participation_status,
        'driver_id', q.driver_id,
        'driver_active', q.driver_active
      )
      order by q.full_name, q.person_id
    ),
    '[]'::jsonb
  )
  into _candidates
  from (
    select distinct
      p.id as person_id,
      op.id as participation_id,
      p.full_name,
      op.participation_kind::text as participation_kind,
      op.status::text as participation_status,
      d.id as driver_id,
      coalesce(d.is_active, false) as driver_active
    from public.operation_participations op
    join public.people p
      on p.id = op.person_id
     and p.tenant_id = op.tenant_id
    join public.operation_role_assignments ora
      on ora.participation_id = op.id
     and ora.tenant_id = op.tenant_id
    join public.operation_role_types ort
      on ort.id = ora.role_type_id
     and ort.tenant_id = op.tenant_id
     and ort.key = 'driver'
     and ort.is_active = true
    left join public.drivers d
      on d.tenant_id = op.tenant_id
     and d.person_id = op.person_id
    where op.operation_id = _operation_id
      and op.tenant_id = _tenant_id
      and op.participation_kind = 'crew'
      and op.status <> 'cancelled'
  ) q;

  return jsonb_build_object('candidates', _candidates);
end;
$function$;

revoke all on function public.w05_operation_driver_candidates(uuid) from public, anon;
grant execute on function public.w05_operation_driver_candidates(uuid) to authenticated, service_role;

comment on function public.w05_operation_driver_candidates(uuid) is
'Returns operation-scoped eligible driver candidates as {candidates:[...]} for the W05 UI. Eligibility remains contextual to an active driver responsibility in the operation.';

notify pgrst, 'reload schema';