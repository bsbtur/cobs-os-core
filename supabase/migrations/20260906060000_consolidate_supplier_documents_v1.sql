-- COBS OS · Consolidation V3.1 -> canonical main
-- Operation document requirements + supplier document governance.
-- Schema/capability only: no STAGING rows are copied.

create table public.operation_document_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  requirement_key text not null,
  label text not null,
  description text,
  required boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, requirement_key)
);

alter table public.operation_document_requirements enable row level security;

create policy "Operation roles read document requirements"
on public.operation_document_requirements
for select to authenticated
using (app_private.has_tenant_role(tenant_id,array['owner','admin','operations_agent']::public.app_role[]));

create policy "Operation roles manage document requirements"
on public.operation_document_requirements
for all to authenticated
using (app_private.has_tenant_role(tenant_id,array['owner','admin','operations_agent']::public.app_role[]))
with check (app_private.has_tenant_role(tenant_id,array['owner','admin','operations_agent']::public.app_role[]));

revoke all on public.operation_document_requirements from public, anon;
grant select,insert,update,delete on public.operation_document_requirements to authenticated;
grant all on public.operation_document_requirements to service_role;

create table public.supplier_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  quote_id uuid references public.operation_quotes(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  document_type text not null check (document_type in ('quote','contract','invoice','receipt','insurance','license','other')),
  title text not null,
  reference_url text,
  status text not null default 'received' check (status in ('pending','received','approved','rejected','expired')),
  issued_at date,
  expires_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or issued_at is null or expires_at >= issued_at)
);

alter table public.supplier_documents enable row level security;

create policy "Operation roles read supplier documents"
on public.supplier_documents
for select to authenticated
using (app_private.has_tenant_role(tenant_id,array['owner','admin','operations_agent']::public.app_role[]));

create policy "Owners and admins manage supplier documents"
on public.supplier_documents
for all to authenticated
using (app_private.has_tenant_role(tenant_id,array['owner','admin']::public.app_role[]))
with check (app_private.has_tenant_role(tenant_id,array['owner','admin']::public.app_role[]));

revoke all on public.supplier_documents from public, anon;
grant select,insert,update,delete on public.supplier_documents to authenticated;
grant all on public.supplier_documents to service_role;

create or replace view public.operation_supplier_document_summary
with (security_invoker=true) as
select
  o.tenant_id,
  o.id as operation_id,
  count(d.id)::integer as total_documents,
  count(d.id) filter (where d.status='approved')::integer as approved_documents,
  count(d.id) filter (where d.status in ('pending','received'))::integer as pending_documents,
  count(d.id) filter (where d.status='rejected')::integer as rejected_documents,
  count(d.id) filter (where d.expires_at is not null and d.expires_at < current_date and d.status <> 'expired')::integer as overdue_expirations
from public.operations o
left join public.supplier_documents d on d.operation_id=o.id and d.tenant_id=o.tenant_id
group by o.tenant_id,o.id;

revoke all on public.operation_supplier_document_summary from public, anon;
grant select on public.operation_supplier_document_summary to authenticated, service_role;

create or replace function public.add_supplier_document(
  _quote_id uuid,
  _document_type text,
  _title text,
  _reference_url text default null,
  _issued_at date default null,
  _expires_at date default null,
  _notes text default null
) returns uuid
language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare v_quote public.operation_quotes%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_quote from public.operation_quotes where id=_quote_id;
  if not found then raise exception 'quote_not_found'; end if;
  if not app_private.has_tenant_role(v_quote.tenant_id,array['owner','admin']::public.app_role[]) then raise exception 'forbidden'; end if;
  if _document_type not in ('quote','contract','invoice','receipt','insurance','license','other') then raise exception 'invalid_document_type'; end if;
  if length(trim(coalesce(_title,''))) < 2 then raise exception 'title_required'; end if;
  if _expires_at is not null and _issued_at is not null and _expires_at < _issued_at then raise exception 'invalid_expiration'; end if;
  insert into public.supplier_documents(tenant_id,operation_id,quote_id,supplier_id,document_type,title,reference_url,issued_at,expires_at,notes,status)
  values(v_quote.tenant_id,v_quote.operation_id,v_quote.id,v_quote.supplier_id,_document_type,trim(_title),nullif(trim(coalesce(_reference_url,'')),''),_issued_at,_expires_at,nullif(trim(coalesce(_notes,'')),''),'received') returning id into v_id;
  return v_id;
end $$;

create or replace function public.set_supplier_document_status(_document_id uuid,_status text)
returns jsonb
language plpgsql security definer
set search_path=public,app_private,pg_temp
as $$
declare v_doc public.supplier_documents%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_doc from public.supplier_documents where id=_document_id for update;
  if not found then raise exception 'document_not_found'; end if;
  if not app_private.has_tenant_role(v_doc.tenant_id,array['owner','admin']::public.app_role[]) then raise exception 'forbidden'; end if;
  if _status not in ('pending','received','approved','rejected','expired') then raise exception 'invalid_status'; end if;
  update public.supplier_documents set status=_status,updated_at=now() where id=_document_id;
  return jsonb_build_object('document_id',_document_id,'status',_status);
end $$;

revoke all on function public.add_supplier_document(uuid,text,text,text,date,date,text) from public, anon;
revoke all on function public.set_supplier_document_status(uuid,text) from public, anon;
grant execute on function public.add_supplier_document(uuid,text,text,text,date,date,text) to authenticated, service_role;
grant execute on function public.set_supplier_document_status(uuid,text) to authenticated, service_role;
