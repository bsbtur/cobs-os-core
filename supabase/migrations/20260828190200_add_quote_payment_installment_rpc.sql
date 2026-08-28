create or replace function public.add_quote_payment_installment(
  _quote_id uuid,
  _due_date date,
  _amount_minor bigint,
  _notes text default null
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  _uid uuid := auth.uid();
  _q public.operation_quotes;
  _installment_no int;
  _current_total bigint;
  _id uuid;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  select * into _q from public.operation_quotes where id=_quote_id for update;
  if _q.id is null then raise exception 'Quote not found'; end if;
  if not app_private.has_tenant_role(_q.tenant_id,array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins can manage payment schedules';
  end if;
  if _amount_minor <= 0 then raise exception 'Installment amount must be greater than zero'; end if;

  select coalesce(max(installment_no),0)+1,coalesce(sum(amount_minor) filter(where status<>'cancelled'),0)
  into _installment_no,_current_total
  from public.quote_payment_schedule
  where quote_id=_q.id;

  if _current_total + _amount_minor > _q.amount_minor then
    raise exception 'Payment schedule exceeds quote amount';
  end if;

  insert into public.quote_payment_schedule(tenant_id,quote_id,installment_no,due_date,amount_minor,notes)
  values(_q.tenant_id,_q.id,_installment_no,_due_date,_amount_minor,nullif(btrim(coalesce(_notes,'')),''))
  returning id into _id;

  perform app_private.record_audit_event(_q.tenant_id,_uid,'procurement.installment_created','quote_payment_schedule',_id,null,jsonb_build_object('quote_id',_q.id,'due_date',_due_date,'amount_minor',_amount_minor,'installment_no',_installment_no));
  return _id;
end;
$$;

grant execute on function public.add_quote_payment_installment(uuid,date,bigint,text) to authenticated;
