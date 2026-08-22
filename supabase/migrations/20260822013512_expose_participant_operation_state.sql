create or replace function public.get_my_operations()
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog','public'
as $function$
  select coalesce(jsonb_agg(x order by x->>'planned_start'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'operation_id', o.id,
      'name', o.name,
      'operation_kind', o.operation_kind,
      'operation_status', o.status,
      'primary_country', o.primary_country,
      'primary_region', o.primary_region,
      'primary_city', o.primary_city,
      'timezone', o.timezone,
      'planned_start', o.planned_start,
      'planned_end', o.planned_end,
      'expected_start', o.expected_start,
      'expected_end', o.expected_end,
      'historical', (o.status = 'completed' or o.archived_at is not null),
      'participation_kind', pa.participation_kind,
      'participation_status', pa.status,
      'grant_status', g.status,
      'effective_access', (app_private.w10_effective_access(g.operation_id) is not null)
    ) as x
    from public.participant_access_grants g
    join public.people p on p.id = g.person_id and p.tenant_id = g.tenant_id
    join public.operation_participations pa
      on pa.id = g.participation_id and pa.tenant_id = g.tenant_id
    join public.operations o on o.id = g.operation_id and o.tenant_id = g.tenant_id
    where auth.uid() is not null
      and g.status = 'active'
      and g.profile_id = auth.uid()
      and p.profile_id = auth.uid()
      and pa.person_id = g.person_id
      and pa.operation_id = g.operation_id
      and pa.status in ('expected','confirmed')
      and o.status <> 'cancelled'
  ) s
$function$;

create or replace function public.get_my_participant_access()
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog','public'
as $function$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'grant_id', g.id,
      'operation_id', g.operation_id,
      'operation_name', o.name,
      'operation_status', o.status,
      'participation_status', pa.status,
      'status', g.status,
      'origin', g.origin,
      'activated_at', g.activated_at,
      'revoked_at', g.revoked_at,
      'created_at', g.created_at,
      'effective', (app_private.w10_effective_access(g.operation_id) is not null),
      'historical', (o.status = 'completed' or o.archived_at is not null)
    ) as x
    from public.participant_access_grants g
    join public.operations o on o.id = g.operation_id and o.tenant_id = g.tenant_id
    join public.operation_participations pa
      on pa.id = g.participation_id and pa.tenant_id = g.tenant_id
    where auth.uid() is not null
      and g.profile_id = auth.uid()
  ) s
$function$;