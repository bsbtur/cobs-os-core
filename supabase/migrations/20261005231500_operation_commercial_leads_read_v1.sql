-- Authenticated manager read model for operation commercial lead queue.
-- Avoids client-side RLS ambiguity while preserving tenant and role checks.

create or replace function public.list_operation_commercial_leads(_operation_id uuid)
returns table(
  id uuid,
  full_name text,
  email text,
  phone text,
  status text,
  metadata jsonb,
  converted_person_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
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
  select l.id, l.full_name, l.email, l.phone, l.status, l.metadata,
         l.converted_person_id, l.created_at
    from public.commercial_leads l
   where l.operation_id = _operation_id
     and l.tenant_id = _tenant_id
     and l.converted_person_id is null
   order by l.created_at desc;
end;
$$;

revoke all on function public.list_operation_commercial_leads(uuid) from public, anon, service_role;
grant execute on function public.list_operation_commercial_leads(uuid) to authenticated;
