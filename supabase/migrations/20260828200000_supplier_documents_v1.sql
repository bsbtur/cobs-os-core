create table if not exists public.supplier_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  quote_id uuid references public.operation_quotes(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  document_type text not null check(document_type in ('quote','contract','invoice','receipt','insurance','license','other')),
  title text not null,
  reference_url text,
  status text not null default 'received' check(status in ('pending','received','approved','rejected','expired')),
  issued_at date,
  expires_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_documents_operation_idx
  on public.supplier_documents(operation_id,status,document_type);
create index if not exists supplier_documents_supplier_idx
  on public.supplier_documents(supplier_id,created_at desc);

alter table public.supplier_documents enable row level security;

drop policy if exists supplier_documents_read on public.supplier_documents;
drop policy if exists supplier_documents_write on public.supplier_documents;

create policy supplier_documents_read on public.supplier_documents
for select to authenticated
using (app_private.has_tenant_role(tenant_id,array['owner','admin','operations_agent']::public.app_role[]));

create policy supplier_documents_write on public.supplier_documents
for all to authenticated
using (app_private.has_tenant_role(tenant_id,array['owner','admin']::public.app_role[]))
with check (app_private.has_tenant_role(tenant_id,array['owner','admin']::public.app_role[]));

create or replace function public.add_supplier_document(
  _quote_id uuid,
  _document_type text,
  _title text,
  _reference_url text default null,
  _issued_at date default null,
  _expires_at date default null,
  _notes text default null
) returns uuid
language plpgsql
security definer
set search_path='public','app_private'
as $$
declare
  v_quote public.operation_quotes%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_quote from public.operation_quotes where id=_quote_id;
  if not found then raise exception 'quote_not_found'; end if;
  if not app_private.has_tenant_role(v_quote.tenant_id,array['owner','admin']::public.app_role[]) then raise exception 'forbidden'; end if;
  if _document_type not in ('quote','contract','invoice','receipt','insurance','license','other') then raise exception 'invalid_document_type'; end if;
  if length(trim(coalesce(_title,'')))<2 then raise exception 'title_required'; end if;

  insert into public.supplier_documents(
    tenant_id,operation_id,quote_id,supplier_id,document_type,title,reference_url,issued_at,expires_at,notes,status
  ) values(
    v_quote.tenant_id,v_quote.operation_id,v_quote.id,v_quote.supplier_id,_document_type,trim(_title),
    nullif(trim(coalesce(_reference_url,'')),''),_issued_at,_expires_at,nullif(trim(coalesce(_notes,'')),''),'received'
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function public.add_supplier_document(uuid,text,text,text,date,date,text) from public;
grant execute on function public.add_supplier_document(uuid,text,text,text,date,date,text) to authenticated;

create or replace function public.set_supplier_document_status(_document_id uuid,_status text)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private'
as $$
declare
  v_doc public.supplier_documents%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_doc from public.supplier_documents where id=_document_id for update;
  if not found then raise exception 'document_not_found'; end if;
  if not app_private.has_tenant_role(v_doc.tenant_id,array['owner','admin']::public.app_role[]) then raise exception 'forbidden'; end if;
  if _status not in ('pending','received','approved','rejected','expired') then raise exception 'invalid_status'; end if;

  update public.supplier_documents set status=_status,updated_at=now() where id=_document_id;
  return jsonb_build_object('document_id',_document_id,'status',_status);
end $$;

revoke all on function public.set_supplier_document_status(uuid,text) from public;
grant execute on function public.set_supplier_document_status(uuid,text) to authenticated;

create or replace view public.operation_supplier_document_summary with (security_invoker=true) as
select
  o.tenant_id,
  o.id operation_id,
  count(d.id)::int total_documents,
  count(d.id) filter(where d.status='approved')::int approved_documents,
  count(d.id) filter(where d.status in ('pending','received'))::int pending_documents,
  count(d.id) filter(where d.status='rejected')::int rejected_documents,
  count(d.id) filter(where d.expires_at is not null and d.expires_at<current_date and d.status<>'expired')::int overdue_expirations
from public.operations o
left join public.supplier_documents d on d.operation_id=o.id and d.tenant_id=o.tenant_id
group by o.tenant_id,o.id;

grant select on public.operation_supplier_document_summary to authenticated;
