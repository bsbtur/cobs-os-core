alter table public.commercial_leads
  add column if not exists assigned_profile_id uuid null references public.profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz null,
  add column if not exists status_changed_at timestamptz not null default now();

create index if not exists commercial_leads_operation_status_idx
  on public.commercial_leads (operation_id, status, created_at desc);

create index if not exists commercial_leads_assigned_profile_idx
  on public.commercial_leads (assigned_profile_id)
  where assigned_profile_id is not null;

drop function if exists public.list_operation_commercial_leads(uuid);

create function public.list_operation_commercial_leads(_operation_id uuid)
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
    and l.status <> 'archived'
  order by l.created_at desc;
end;
$function$;

create or replace function public.list_commercial_lead_assignees(_operation_id uuid)
returns table(
  profile_id uuid,
  display_name text,
  role text
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

  select o.tenant_id into _tenant_id
  from public.operations o
  where o.id = _operation_id;

  if _tenant_id is null then
    raise exception 'Operation not found';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = _tenant_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
  ) then
    raise exception 'Manager access required';
  end if;

  return query
  select p.id, coalesce(p.display_name, p.email, 'Sem nome'), m.role::text
  from public.memberships m
  join public.profiles p on p.id = m.profile_id
  where m.tenant_id = _tenant_id
    and m.status = 'active'
  order by coalesce(p.display_name, p.email, 'Sem nome');
end;
$function$;

create or replace function public.update_commercial_lead_pipeline(
  _lead_id uuid,
  _status text default null,
  _assigned_profile_id uuid default null,
  _clear_assignee boolean default false
)
returns table(
  id uuid,
  status text,
  assigned_profile_id uuid,
  assigned_profile_name text,
  assigned_at timestamptz,
  status_changed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  _lead public.commercial_leads%rowtype;
  _new_status text;
  _new_assignee uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into _lead
  from public.commercial_leads
  where commercial_leads.id = _lead_id
  for update;

  if _lead.id is null then
    raise exception 'Lead not found';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = _lead.tenant_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
  ) then
    raise exception 'Manager access required';
  end if;

  _new_status := coalesce(_status, _lead.status);

  if _new_status not in ('new','contacted','qualified','converted','lost') then
    raise exception 'Invalid commercial lead status';
  end if;

  if _clear_assignee then
    _new_assignee := null;
  elsif _assigned_profile_id is not null then
    if not exists (
      select 1 from public.memberships m
      where m.tenant_id = _lead.tenant_id
        and m.profile_id = _assigned_profile_id
        and m.status = 'active'
    ) then
      raise exception 'Assignee must be an active tenant member';
    end if;
    _new_assignee := _assigned_profile_id;
  else
    _new_assignee := _lead.assigned_profile_id;
  end if;

  update public.commercial_leads l
  set status = _new_status,
      status_changed_at = case
        when _new_status is distinct from _lead.status then now()
        else l.status_changed_at
      end,
      assigned_profile_id = _new_assignee,
      assigned_at = case
        when _new_assignee is distinct from _lead.assigned_profile_id
          then case when _new_assignee is null then null else now() end
        else l.assigned_at
      end,
      updated_at = now()
  where l.id = _lead_id
  returning l.* into _lead;

  return query
  select
    _lead.id,
    _lead.status,
    _lead.assigned_profile_id,
    p.display_name,
    _lead.assigned_at,
    _lead.status_changed_at,
    _lead.updated_at
  from public.profiles p
  where p.id = _lead.assigned_profile_id

  union all

  select
    _lead.id,
    _lead.status,
    null::uuid,
    null::text,
    _lead.assigned_at,
    _lead.status_changed_at,
    _lead.updated_at
  where _lead.assigned_profile_id is null;
end;
$function$;

revoke all on function public.list_operation_commercial_leads(uuid) from public, anon;
revoke all on function public.list_commercial_lead_assignees(uuid) from public, anon;
revoke all on function public.update_commercial_lead_pipeline(uuid,text,uuid,boolean) from public, anon;

grant execute on function public.list_operation_commercial_leads(uuid) to authenticated;
grant execute on function public.list_commercial_lead_assignees(uuid) to authenticated;
grant execute on function public.update_commercial_lead_pipeline(uuid,text,uuid,boolean) to authenticated;
