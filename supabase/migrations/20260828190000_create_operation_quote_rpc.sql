create or replace function public.create_operation_quote(
  _operation_id uuid,
  _supplier_name text,
  _category text,
  _description text,
  _amount_minor bigint,
  _valid_until date default null,
  _cancellation_terms text default null,
  _notes text default null
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  _uid uuid := auth.uid();
  _op public.operations;
  _supplier_id uuid;
  _quote_id uuid;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  select * into _op from public.operations where id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id,array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins can manage procurement quotes';
  end if;
  if nullif(btrim(_supplier_name),'') is null or nullif(btrim(_category),'') is null or nullif(btrim(_description),'') is null then
    raise exception 'Supplier, category and description are required';
  end if;
  if _amount_minor < 0 then raise exception 'Amount cannot be negative'; end if;

  insert into public.suppliers(tenant_id,name,category)
  values(_op.tenant_id,btrim(_supplier_name),btrim(_category))
  on conflict(tenant_id,name) do update set category=coalesce(excluded.category,public.suppliers.category),updated_at=now()
  returning id into _supplier_id;

  insert into public.operation_quotes(tenant_id,operation_id,supplier_id,category,description,amount_minor,valid_until,cancellation_terms,notes)
  values(_op.tenant_id,_op.id,_supplier_id,btrim(_category),btrim(_description),_amount_minor,_valid_until,nullif(btrim(coalesce(_cancellation_terms,'')),''),nullif(btrim(coalesce(_notes,'')),''))
  returning id into _quote_id;

  perform app_private.record_audit_event(_op.tenant_id,_uid,'procurement.quote_created','operation_quote',_quote_id,null,jsonb_build_object('operation_id',_op.id,'supplier_id',_supplier_id,'category',btrim(_category),'amount_minor',_amount_minor));
  return _quote_id;
end;
$$;

grant execute on function public.create_operation_quote(uuid,text,text,text,bigint,date,text,text) to authenticated;
