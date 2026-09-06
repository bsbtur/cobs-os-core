-- COBS OS · Consolidation V3.1 -> canonical main
-- Procurement workflow delta only. No supplier/payment data is copied or mutated.

alter table public.operation_quotes
  add column if not exists contracted_at timestamptz,
  add column if not exists contract_reference text,
  add column if not exists contract_notes text;

create or replace view public.operation_supplier_commitment_summary
with (security_invoker=true) as
select
  o.tenant_id,
  o.id as operation_id,
  coalesce(sum(q.amount_minor) filter (where q.status='contracted'),0)::bigint as contracted_total_minor,
  coalesce(sum(ps.amount_minor) filter (where q.status='contracted' and ps.status='paid'),0)::bigint as paid_total_minor,
  coalesce(sum(ps.amount_minor) filter (where q.status='contracted' and ps.status in ('planned','due')),0)::bigint as scheduled_outstanding_minor,
  coalesce(sum(q.amount_minor) filter (where q.status='contracted'),0)::bigint
    - coalesce(sum(ps.amount_minor) filter (where q.status='contracted' and ps.status='paid'),0)::bigint as contract_balance_minor,
  min(ps.due_date) filter (where q.status='contracted' and ps.status in ('planned','due')) as next_due_date,
  count(distinct q.id) filter (where q.status='contracted')::int as contracted_suppliers,
  count(ps.id) filter (where q.status='contracted' and ps.status in ('planned','due'))::int as open_installments
from public.operations o
left join public.operation_quotes q
  on q.operation_id=o.id and q.tenant_id=o.tenant_id
left join public.quote_payment_schedule ps
  on ps.quote_id=q.id and ps.tenant_id=q.tenant_id and ps.status<>'cancelled'
group by o.tenant_id,o.id;

grant select on public.operation_supplier_commitment_summary to authenticated;

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
language plpgsql security definer
set search_path='pg_catalog','public'
as $$
declare
  v_uid uuid := auth.uid();
  v_op public.operations%rowtype;
  v_supplier_id uuid;
  v_quote_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_op from public.operations where id=_operation_id;
  if not found then raise exception 'operation_not_found'; end if;
  if not app_private.has_tenant_role(v_op.tenant_id,array['owner','admin']::public.app_role[]) then
    raise exception 'forbidden';
  end if;
  if nullif(btrim(_supplier_name),'') is null then raise exception 'supplier_name_required'; end if;
  if nullif(btrim(_category),'') is null then raise exception 'category_required'; end if;
  if nullif(btrim(_description),'') is null then raise exception 'description_required'; end if;
  if _amount_minor <= 0 then raise exception 'amount_must_be_positive'; end if;

  insert into public.suppliers(tenant_id,name,category)
  values(v_op.tenant_id,btrim(_supplier_name),btrim(_category))
  on conflict(tenant_id,name) do update
    set category=coalesce(excluded.category,public.suppliers.category), updated_at=now()
  returning id into v_supplier_id;

  insert into public.operation_quotes(
    tenant_id,operation_id,supplier_id,category,description,amount_minor,
    valid_until,cancellation_terms,notes
  ) values(
    v_op.tenant_id,v_op.id,v_supplier_id,btrim(_category),btrim(_description),_amount_minor,
    _valid_until,nullif(btrim(coalesce(_cancellation_terms,'')),''),nullif(btrim(coalesce(_notes,'')),'')
  ) returning id into v_quote_id;

  perform app_private.record_audit_event(
    v_op.tenant_id,v_uid,'procurement.quote_created','operation_quote',v_quote_id,null,
    jsonb_build_object('operation_id',v_op.id,'supplier_id',v_supplier_id,'category',btrim(_category),'amount_minor',_amount_minor)
  );
  return v_quote_id;
end;
$$;

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
language plpgsql security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_quote public.operation_quotes%rowtype;
  v_supplier_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_quote from public.operation_quotes where id=_quote_id for update;
  if not found then raise exception 'quote_not_found'; end if;
  if not app_private.has_tenant_role(v_quote.tenant_id,array['owner','admin']::public.app_role[]) then
    raise exception 'forbidden';
  end if;
  if v_quote.status='contracted' then raise exception 'contracted_quote_is_read_only'; end if;
  if exists(select 1 from public.quote_payment_schedule s where s.quote_id=_quote_id and s.status<>'cancelled') then
    raise exception 'quote_with_payment_schedule_is_read_only';
  end if;
  if nullif(btrim(_supplier_name),'') is null then raise exception 'supplier_name_required'; end if;
  if nullif(btrim(_category),'') is null then raise exception 'category_required'; end if;
  if nullif(btrim(_description),'') is null then raise exception 'description_required'; end if;
  if _amount_minor <= 0 then raise exception 'amount_must_be_positive'; end if;

  insert into public.suppliers(tenant_id,name,category)
  values(v_quote.tenant_id,btrim(_supplier_name),btrim(_category))
  on conflict(tenant_id,name) do update set category=excluded.category,updated_at=now()
  returning id into v_supplier_id;

  update public.operation_quotes set
    supplier_id=v_supplier_id,
    category=btrim(_category),
    description=btrim(_description),
    amount_minor=_amount_minor,
    valid_until=_valid_until,
    cancellation_terms=nullif(btrim(coalesce(_cancellation_terms,'')),''),
    notes=nullif(btrim(coalesce(_notes,'')),''),
    updated_at=now()
  where id=_quote_id returning * into v_quote;

  perform app_private.record_audit_event(
    v_quote.tenant_id,v_uid,'procurement.quote_updated','operation_quote',v_quote.id,null,
    jsonb_build_object('operation_id',v_quote.operation_id,'supplier_id',v_supplier_id,'category',v_quote.category,'amount_minor',v_quote.amount_minor)
  );
  return v_quote;
end;
$$;

create or replace function public.select_operation_quote(_quote_id uuid)
returns jsonb
language plpgsql security definer
set search_path='pg_catalog','public'
as $$
declare
  v_uid uuid := auth.uid();
  v_q public.operation_quotes%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_q from public.operation_quotes where id=_quote_id for update;
  if not found then raise exception 'quote_not_found'; end if;
  if not app_private.has_tenant_role(v_q.tenant_id,array['owner','admin']::public.app_role[]) then raise exception 'forbidden'; end if;
  if v_q.status='contracted' then raise exception 'contracted_quote_is_read_only'; end if;

  update public.operation_quotes
    set status='shortlisted',selected_at=null,updated_at=now()
    where operation_id=v_q.operation_id and category=v_q.category and id<>v_q.id and status='selected';
  update public.operation_quotes
    set status='selected',selected_at=now(),updated_at=now()
    where id=v_q.id;

  perform app_private.record_audit_event(
    v_q.tenant_id,v_uid,'procurement.quote_selected','operation_quote',v_q.id,null,
    jsonb_build_object('operation_id',v_q.operation_id,'category',v_q.category,'amount_minor',v_q.amount_minor)
  );
  return jsonb_build_object('quote_id',v_q.id,'status','selected');
end;
$$;

create or replace function public.add_quote_payment_installment(
  _quote_id uuid,
  _due_date date,
  _amount_minor bigint,
  _notes text default null
) returns uuid
language plpgsql security definer
set search_path='pg_catalog','public'
as $$
declare
  v_uid uuid := auth.uid();
  v_q public.operation_quotes%rowtype;
  v_installment_no int;
  v_current_total bigint;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_q from public.operation_quotes where id=_quote_id for update;
  if not found then raise exception 'quote_not_found'; end if;
  if not app_private.has_tenant_role(v_q.tenant_id,array['owner','admin']::public.app_role[]) then raise exception 'forbidden'; end if;
  if v_q.status='contracted' then raise exception 'contracted_quote_is_read_only'; end if;
  if _amount_minor <= 0 then raise exception 'amount_must_be_positive'; end if;

  select coalesce(max(installment_no),0)+1,
         coalesce(sum(amount_minor) filter(where status<>'cancelled'),0)
    into v_installment_no,v_current_total
    from public.quote_payment_schedule where quote_id=v_q.id;
  if v_current_total + _amount_minor > v_q.amount_minor then raise exception 'payment_schedule_exceeds_quote_amount'; end if;

  insert into public.quote_payment_schedule(tenant_id,quote_id,installment_no,due_date,amount_minor,notes)
  values(v_q.tenant_id,v_q.id,v_installment_no,_due_date,_amount_minor,nullif(btrim(coalesce(_notes,'')),''))
  returning id into v_id;

  perform app_private.record_audit_event(
    v_q.tenant_id,v_uid,'procurement.installment_created','quote_payment_schedule',v_id,null,
    jsonb_build_object('quote_id',v_q.id,'due_date',_due_date,'amount_minor',_amount_minor,'installment_no',v_installment_no)
  );
  return v_id;
end;
$$;

create or replace function public.contract_operation_quote(
  _quote_id uuid,
  _contract_reference text default null,
  _contract_notes text default null
) returns jsonb
language plpgsql security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_q public.operation_quotes%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_q from public.operation_quotes where id=_quote_id for update;
  if not found then raise exception 'quote_not_found'; end if;
  if not app_private.has_tenant_role(v_q.tenant_id,array['owner','admin']::public.app_role[]) then raise exception 'forbidden'; end if;
  if v_q.status not in ('selected','contracted') then raise exception 'quote_must_be_selected'; end if;

  update public.operation_quotes set
    status='contracted',
    contracted_at=coalesce(contracted_at,now()),
    contract_reference=nullif(btrim(coalesce(_contract_reference,'')),''),
    contract_notes=nullif(btrim(coalesce(_contract_notes,'')),''),
    updated_at=now()
  where id=_quote_id;

  perform app_private.record_audit_event(
    v_q.tenant_id,v_uid,'supplier.contract_formalized','operation_quote',v_q.id,null,
    jsonb_build_object('operation_id',v_q.operation_id,'category',v_q.category,'amount_minor',v_q.amount_minor,'contract_reference',nullif(btrim(coalesce(_contract_reference,'')),''))
  );
  return jsonb_build_object('quote_id',_quote_id,'status','contracted');
end;
$$;

create or replace function public.mark_quote_payment_paid(
  _schedule_id uuid,
  _paid_at timestamptz default now()
) returns jsonb
language plpgsql security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.quote_payment_schedule%rowtype;
  v_q public.operation_quotes%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_p from public.quote_payment_schedule where id=_schedule_id for update;
  if not found then raise exception 'payment_schedule_not_found'; end if;
  select * into v_q from public.operation_quotes where id=v_p.quote_id;
  if not found then raise exception 'quote_not_found'; end if;
  if not app_private.has_tenant_role(v_p.tenant_id,array['owner','admin']::public.app_role[]) then raise exception 'forbidden'; end if;
  if v_q.status<>'contracted' then raise exception 'supplier_not_contracted'; end if;

  update public.quote_payment_schedule
    set status='paid',paid_at=coalesce(_paid_at,now())
    where id=_schedule_id;

  perform app_private.record_audit_event(
    v_p.tenant_id,v_uid,'supplier.payment_paid','quote_payment_schedule',v_p.id,null,
    jsonb_build_object('quote_id',v_p.quote_id,'amount_minor',v_p.amount_minor,'due_date',v_p.due_date,'paid_at',coalesce(_paid_at,now()))
  );
  return jsonb_build_object('schedule_id',_schedule_id,'status','paid');
end;
$$;

-- SECURITY DEFINER functions are opt-in only.
revoke all on function public.create_operation_quote(uuid,text,text,text,bigint,date,text,text) from public, anon;
revoke all on function public.update_operation_quote(uuid,text,text,text,bigint,date,text,text) from public, anon;
revoke all on function public.select_operation_quote(uuid) from public, anon;
revoke all on function public.add_quote_payment_installment(uuid,date,bigint,text) from public, anon;
revoke all on function public.contract_operation_quote(uuid,text,text) from public, anon;
revoke all on function public.mark_quote_payment_paid(uuid,timestamptz) from public, anon;

grant execute on function public.create_operation_quote(uuid,text,text,text,bigint,date,text,text) to authenticated, service_role;
grant execute on function public.update_operation_quote(uuid,text,text,text,bigint,date,text,text) to authenticated, service_role;
grant execute on function public.select_operation_quote(uuid) to authenticated, service_role;
grant execute on function public.add_quote_payment_installment(uuid,date,bigint,text) to authenticated, service_role;
grant execute on function public.contract_operation_quote(uuid,text,text) to authenticated, service_role;
grant execute on function public.mark_quote_payment_paid(uuid,timestamptz) to authenticated, service_role;
