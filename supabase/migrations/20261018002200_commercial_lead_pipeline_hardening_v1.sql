-- Commercial lead pipeline hardening after QA/audit.
-- Preserve existing read use cases for managers, force writes through governed RPCs,
-- preserve the historical meaning of status='converted', and repair stage-age backfill.

-- Leads contain contact PII. Direct authenticated reads are manager-only.
drop policy if exists commercial_leads_staff_select on public.commercial_leads;
drop policy if exists commercial_leads_manager_select on public.commercial_leads;

create policy commercial_leads_manager_select on public.commercial_leads
for select to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.tenant_id = commercial_leads.tenant_id
      and m.profile_id = (select auth.uid())
      and m.status::text = 'active'
      and m.role in ('owner','admin')
  )
);

-- Preserve the pre-existing approval queue semantics: People must never receive
-- a lead that is already linked to a Person, and archived leads are not approvable.
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

  select o.tenant_id into _tenant_id
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
    and l.status <> 'archived'
  order by l.created_at desc;
end;
$function$;

-- The CRM board needs a different read model: converted leads remain visible as
-- evidence of the funnel, but archived leads stay hidden.
create or replace function public.list_operation_commercial_lead_pipeline(_operation_id uuid)
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

  select o.tenant_id into _tenant_id
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

revoke all on function public.list_operation_commercial_leads(uuid)
  from public, anon, service_role;
revoke all on function public.list_operation_commercial_lead_pipeline(uuid)
  from public, anon, service_role;
grant execute on function public.list_operation_commercial_leads(uuid)
  to authenticated;
grant execute on function public.list_operation_commercial_lead_pipeline(uuid)
  to authenticated;

-- All authenticated writes must go through governed SECURITY DEFINER commands.
revoke update on table public.commercial_leads from authenticated;
drop policy if exists commercial_leads_staff_update on public.commercial_leads;

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
  _old_status text;
  _old_assignee uuid;
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
    select 1
    from public.memberships m
    where m.tenant_id = _lead.tenant_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
  ) then
    raise exception 'Manager access required';
  end if;

  if _lead.status = 'archived' then
    raise exception 'Archived lead is read-only';
  end if;

  _old_status := _lead.status;
  _old_assignee := _lead.assigned_profile_id;
  _new_status := coalesce(_status, _lead.status);

  if _new_status not in ('new','contacted','qualified','converted','lost') then
    raise exception 'Invalid commercial lead status';
  end if;

  -- In COBS, converted means the canonical Person conversion already happened.
  -- The CRM pipeline may display that state, but must never manufacture it.
  if _new_status = 'converted' and _lead.converted_person_id is null then
    raise exception 'Converted status requires canonical Person conversion';
  end if;

  -- Once a Person exists for the lead, conversion is terminal for this pipeline.
  if _lead.converted_person_id is not null and _new_status <> 'converted' then
    raise exception 'Converted lead status is managed by canonical Person conversion';
  end if;

  if _clear_assignee then
    _new_assignee := null;
  elsif _assigned_profile_id is not null then
    if not exists (
      select 1
      from public.memberships m
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

  if _old_status is distinct from _lead.status
     or _old_assignee is distinct from _lead.assigned_profile_id then
    perform app_private.record_audit_event(
      _lead.tenant_id,
      auth.uid(),
      'commercial.lead_pipeline_updated',
      'commercial_lead',
      _lead.id,
      null,
      jsonb_build_object(
        'operation_id', _lead.operation_id,
        'old_status', _old_status,
        'new_status', _lead.status,
        'old_assigned_profile_id', _old_assignee,
        'new_assigned_profile_id', _lead.assigned_profile_id
      )
    );
  end if;

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

revoke all on function public.update_commercial_lead_pipeline(uuid,text,uuid,boolean)
  from public, anon;
grant execute on function public.update_commercial_lead_pipeline(uuid,text,uuid,boolean)
  to authenticated;
