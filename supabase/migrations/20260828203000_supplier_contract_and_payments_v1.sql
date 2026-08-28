alter table public.operation_quotes
  add column if not exists contracted_at timestamptz,
  add column if not exists contract_reference text,
  add column if not exists contract_notes text;

create or replace function public.contract_operation_quote(
  _quote_id uuid,
  _contract_reference text default null,
  _contract_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_q public.operation_quotes%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_q from public.operation_quotes where id = _quote_id for update;
  if not found then raise exception 'quote_not_found'; end if;
  if not app_private.has_tenant_role(v_q.tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'forbidden';
  end if;
  if v_q.status not in ('selected','contracted') then raise exception 'quote_must_be_selected'; end if;

  update public.operation_quotes
     set status = 'contracted',
         contracted_at = coalesce(contracted_at, now()),
         contract_reference = nullif(btrim(_contract_reference), ''),
         contract_notes = nullif(btrim(_contract_notes), ''),
         updated_at = now()
   where id = _quote_id;

  insert into public.audit_events(tenant_id, actor_profile_id, action, subject_type, subject_id, metadata)
  select v_q.tenant_id, p.id, 'supplier.contract_formalized', 'operation_quote', v_q.id,
         jsonb_build_object(
           'operation_id', v_q.operation_id,
           'category', v_q.category,
           'amount_minor', v_q.amount_minor,
           'contract_reference', nullif(btrim(_contract_reference), '')
         )
    from public.profiles p
   where p.id = v_uid
  on conflict do nothing;

  return jsonb_build_object('quote_id', _quote_id, 'status', 'contracted');
end;
$$;

revoke all on function public.contract_operation_quote(uuid, text, text) from public;
grant execute on function public.contract_operation_quote(uuid, text, text) to authenticated;

create or replace function public.mark_quote_payment_paid(
  _schedule_id uuid,
  _paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.quote_payment_schedule%rowtype;
  v_q public.operation_quotes%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_p from public.quote_payment_schedule where id = _schedule_id for update;
  if not found then raise exception 'payment_schedule_not_found'; end if;
  select * into v_q from public.operation_quotes where id = v_p.quote_id;
  if not app_private.has_tenant_role(v_p.tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'forbidden';
  end if;
  if v_q.status <> 'contracted' then raise exception 'supplier_not_contracted'; end if;

  update public.quote_payment_schedule
     set status = 'paid', paid_at = coalesce(_paid_at, now())
   where id = _schedule_id;

  insert into public.audit_events(tenant_id, actor_profile_id, action, subject_type, subject_id, metadata)
  select v_p.tenant_id, p.id, 'supplier.payment_paid', 'quote_payment_schedule', v_p.id,
         jsonb_build_object(
           'quote_id', v_p.quote_id,
           'amount_minor', v_p.amount_minor,
           'due_date', v_p.due_date,
           'paid_at', coalesce(_paid_at, now())
         )
    from public.profiles p
   where p.id = v_uid
  on conflict do nothing;

  return jsonb_build_object('schedule_id', _schedule_id, 'status', 'paid');
end;
$$;

revoke all on function public.mark_quote_payment_paid(uuid, timestamptz) from public;
grant execute on function public.mark_quote_payment_paid(uuid, timestamptz) to authenticated;
