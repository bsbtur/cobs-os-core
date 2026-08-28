create or replace function public.update_operation_quote(
  _quote_id uuid,
  _supplier_name text,
  _category text,
  _description text,
  _amount_minor bigint,
  _valid_until date default null,
  _cancellation_terms text default null,
  _notes text default null
) returns public.operation_quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.operation_quotes;
  v_role text;
  v_supplier_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select q.* into v_quote from public.operation_quotes q where q.id = _quote_id for update;
  if not found then raise exception 'quote_not_found'; end if;
  select p.role::text into v_role from public.profiles p where p.id = auth.uid() and p.tenant_id = v_quote.tenant_id;
  if coalesce(v_role,'') not in ('owner','admin') then raise exception 'permission_denied'; end if;
  if v_quote.status = 'contracted' then raise exception 'contracted_quote_is_read_only'; end if;
  if exists (select 1 from public.quote_payment_schedule s where s.quote_id=_quote_id and s.status <> 'cancelled') then raise exception 'quote_with_payment_schedule_is_read_only'; end if;
  if nullif(trim(_supplier_name),'') is null then raise exception 'supplier_name_required'; end if;
  if _amount_minor <= 0 then raise exception 'amount_must_be_positive'; end if;
  insert into public.suppliers (tenant_id,name,category)
  values (v_quote.tenant_id,trim(_supplier_name),_category)
  on conflict (tenant_id,name) do update set category=excluded.category, updated_at=now()
  returning id into v_supplier_id;
  update public.operation_quotes set supplier_id=v_supplier_id, category=_category, description=_description,
    amount_minor=_amount_minor, valid_until=_valid_until, cancellation_terms=_cancellation_terms, notes=_notes, updated_at=now()
  where id=_quote_id returning * into v_quote;
  return v_quote;
end; $$;

create or replace function public.delete_operation_quote(_quote_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.operation_quotes;
  v_role text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select q.* into v_quote from public.operation_quotes q where q.id=_quote_id for update;
  if not found then raise exception 'quote_not_found'; end if;
  select p.role::text into v_role from public.profiles p where p.id=auth.uid() and p.tenant_id=v_quote.tenant_id;
  if coalesce(v_role,'') not in ('owner','admin') then raise exception 'permission_denied'; end if;
  if v_quote.status in ('selected','contracted') then raise exception 'selected_or_contracted_quote_cannot_be_deleted'; end if;
  if exists (select 1 from public.quote_payment_schedule s where s.quote_id=_quote_id) then raise exception 'quote_with_payment_schedule_cannot_be_deleted'; end if;
  if exists (select 1 from public.supplier_documents d where d.quote_id=_quote_id) then raise exception 'quote_with_documents_cannot_be_deleted'; end if;
  delete from public.operation_quotes where id=_quote_id;
  return true;
end; $$;

revoke all on function public.update_operation_quote(uuid,text,text,text,bigint,date,text,text) from public;
grant execute on function public.update_operation_quote(uuid,text,text,text,bigint,date,text,text) to authenticated;
revoke all on function public.delete_operation_quote(uuid) from public;
grant execute on function public.delete_operation_quote(uuid) to authenticated;