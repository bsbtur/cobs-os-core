-- Commercial lead pipeline hardening after QA/audit.
-- Preserve existing read use cases for managers, force writes through governed RPCs,
-- preserve the historical meaning of status='converted', and repair stage-age backfill.

-- Rows that existed before status_changed_at was introduced received now() as a default.
-- If that synthetic timestamp is newer than the row's last real update, updated_at is a
-- safer historical proxy. Rows changed after the migration are left untouched.
update public.commercial_leads
set status_changed_at = updated_at
where status_changed_at > updated_at;

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
