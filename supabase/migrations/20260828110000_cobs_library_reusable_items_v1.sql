-- COBS LIBRARY V1 — reusable checklist and visit point catalogs
-- Operational items are copied as snapshots into an operation/step.

create table if not exists public.library_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  category text,
  item_kind playbook_item_kind not null default 'check',
  requirement playbook_requirement not null default 'required',
  owner_role_type_id uuid references public.operation_role_types(id) on delete set null,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_visit_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  attraction_name text,
  category text,
  title text not null,
  interpretation text,
  guide_tip text,
  estimated_minutes integer,
  is_required boolean not null default true,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_visit_points_estimated_minutes_check check (estimated_minutes is null or estimated_minutes > 0)
);

create unique index if not exists library_checklist_items_tenant_title_category_uq
  on public.library_checklist_items (tenant_id, lower(title), lower(coalesce(category,''))) where is_active;
create unique index if not exists library_visit_points_tenant_attraction_title_uq
  on public.library_visit_points (tenant_id, lower(coalesce(attraction_name,'')), lower(title)) where is_active;
create index if not exists library_checklist_items_tenant_category_idx
  on public.library_checklist_items(tenant_id, category) where is_active;
create index if not exists library_visit_points_tenant_attraction_idx
  on public.library_visit_points(tenant_id, attraction_name) where is_active;

alter table public.library_checklist_items enable row level security;
alter table public.library_visit_points enable row level security;

create policy "Elevated roles read checklist library" on public.library_checklist_items for select
using (app_private.has_tenant_role(tenant_id, array['owner'::app_role,'admin'::app_role,'operations_agent'::app_role]));
create policy "Elevated roles manage checklist library" on public.library_checklist_items for all
using (app_private.has_tenant_role(tenant_id, array['owner'::app_role,'admin'::app_role,'operations_agent'::app_role]))
with check (app_private.has_tenant_role(tenant_id, array['owner'::app_role,'admin'::app_role,'operations_agent'::app_role]));
create policy "Elevated roles read visit point library" on public.library_visit_points for select
using (app_private.has_tenant_role(tenant_id, array['owner'::app_role,'admin'::app_role,'operations_agent'::app_role]));
create policy "Elevated roles manage visit point library" on public.library_visit_points for all
using (app_private.has_tenant_role(tenant_id, array['owner'::app_role,'admin'::app_role,'operations_agent'::app_role]))
with check (app_private.has_tenant_role(tenant_id, array['owner'::app_role,'admin'::app_role,'operations_agent'::app_role]));

create or replace function public.add_library_checklist_items_to_step(_journey_step_id uuid, _library_item_ids uuid[])
returns setof public.playbook_items language plpgsql security definer set search_path=public,pg_temp as $$
declare v_step public.journey_steps%rowtype; v_next integer; v_id uuid;
begin
 select * into v_step from public.journey_steps where id=_journey_step_id;
 if not found then raise exception 'journey_step_not_found'; end if;
 if not app_private.has_tenant_role(v_step.tenant_id,array['owner'::app_role,'admin'::app_role,'operations_agent'::app_role]) then raise exception 'forbidden'; end if;
 select coalesce(max(sequence),0) into v_next from public.playbook_items where journey_step_id=_journey_step_id;
 foreach v_id in array _library_item_ids loop
  if exists(select 1 from public.library_checklist_items l where l.id=v_id and l.tenant_id=v_step.tenant_id and l.is_active)
     and not exists(select 1 from public.playbook_items p where p.journey_step_id=v_step.id and p.metadata->>'library_source_id'=v_id::text and p.is_active) then
    v_next:=v_next+10;
    insert into public.playbook_items(tenant_id,operation_id,journey_step_id,title,description,item_kind,requirement,owner_role_type_id,sequence,is_active,metadata,created_by)
    select l.tenant_id,v_step.operation_id,v_step.id,l.title,l.description,l.item_kind,l.requirement,l.owner_role_type_id,v_next,true,l.metadata||jsonb_build_object('library_source_id',l.id,'library_source_type','checklist'),auth.uid()
    from public.library_checklist_items l where l.id=v_id;
  end if;
 end loop;
 return query select * from public.playbook_items where journey_step_id=_journey_step_id order by sequence,id;
end $$;

create or replace function public.add_library_visit_points_to_step(_journey_step_id uuid, _library_point_ids uuid[])
returns setof public.journey_visit_points language plpgsql security definer set search_path=public,pg_temp as $$
declare v_step public.journey_steps%rowtype; v_next integer; v_id uuid;
begin
 select * into v_step from public.journey_steps where id=_journey_step_id;
 if not found then raise exception 'journey_step_not_found'; end if;
 if not app_private.has_tenant_role(v_step.tenant_id,array['owner'::app_role,'admin'::app_role,'operations_agent'::app_role]) then raise exception 'forbidden'; end if;
 select coalesce(max(sequence),0) into v_next from public.journey_visit_points where journey_step_id=_journey_step_id;
 foreach v_id in array _library_point_ids loop
  if exists(select 1 from public.library_visit_points l where l.id=v_id and l.tenant_id=v_step.tenant_id and l.is_active)
     and not exists(select 1 from public.journey_visit_points p where p.journey_step_id=v_step.id and p.metadata->>'library_source_id'=v_id::text) then
    v_next:=v_next+10;
    insert into public.journey_visit_points(tenant_id,operation_id,journey_step_id,sequence,title,interpretation,guide_tip,metadata,created_by)
    select l.tenant_id,v_step.operation_id,v_step.id,v_next,l.title,l.interpretation,l.guide_tip,l.metadata||jsonb_build_object('estimated_minutes',l.estimated_minutes,'is_required',l.is_required,'library_source_id',l.id,'library_source_type','visit_point'),auth.uid()
    from public.library_visit_points l where l.id=v_id;
  end if;
 end loop;
 return query select * from public.journey_visit_points where journey_step_id=_journey_step_id order by sequence,id;
end $$;

grant select,insert,update,delete on public.library_checklist_items to authenticated;
grant select,insert,update,delete on public.library_visit_points to authenticated;
grant execute on function public.add_library_checklist_items_to_step(uuid,uuid[]) to authenticated;
grant execute on function public.add_library_visit_points_to_step(uuid,uuid[]) to authenticated;