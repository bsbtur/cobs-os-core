-- Keep the People screen approval queue scoped to leads that are actually approvable.
-- Converted history belongs to the CRM pipeline read model; lost/archived leads are terminal
-- commercial states and must never re-enter operational approval.

create or replace function public.list_operation_commercial_leads(_operation_id uuid)
returns table(
  id uuid,
  full_name text,
  email text,
  phone text,
  status text,
  source text,
  campaign text,
  metadata jsonb,
  converted_person_id uuid,
  assigned_profile_id uuid,
  assigned_profile_name text,
  assigned_at timestamptz,
  status_changed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  _tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select o.tenant_id
    into _tenant_id
    from public.operations o
   where o.id = _operation_id;

  if _tenant_id is null then
    raise exception 'Operation not found';
  end if;

  if not exists (
    select 1
      from public.memberships m
     where m.tenant_id = _tenant_id
       and m.profile_id = auth.uid()
       and m.status = 'active'
       and m.role in ('owner','admin')
  ) then
    raise exception 'Manager access required';
  end if;

  return query
  select
    l.id,
    l.full_name,
    l.email,
    l.phone,
    l.status,
    l.source,
    l.campaign,
    l.metadata,
    l.converted_person_id,
    l.assigned_profile_id,
    p.display_name,
    l.assigned_at,
    l.status_changed_at,
    l.created_at,
    l.updated_at
  from public.commercial_leads l
  left join public.profiles p on p.id = l.assigned_profile_id
  where l.operation_id = _operation_id
    and l.tenant_id = _tenant_id
    and l.converted_person_id is null
    and l.status in ('new','contacted','qualified')
  order by l.created_at desc;
end;
$function$;

revoke all on function public.list_operation_commercial_leads(uuid)
  from public, anon, service_role;
grant execute on function public.list_operation_commercial_leads(uuid)
  to authenticated;
