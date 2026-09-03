create or replace function public.get_my_participant_access()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
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
    join public.people p
      on p.id = g.person_id
     and p.tenant_id = g.tenant_id
     and p.profile_id = auth.uid()
    join public.operations o
      on o.id = g.operation_id
     and o.tenant_id = g.tenant_id
    join public.operation_participations pa
      on pa.id = g.participation_id
     and pa.tenant_id = g.tenant_id
    where auth.uid() is not null
      and g.profile_id = auth.uid()
  ) s
$function$;