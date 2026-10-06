-- Canonical cleanup for synthetic Team Seffrin QA checkout orders.
-- Service-role only; refuses any order with recorded financial settlement.

create or replace function public.cleanup_team_seffrin_qa_order(_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','app_private'
as $function$
declare
  _o public.orders;
  _op_code text;
  _buyer_email text;
  _res record;
  _released integer := 0;
  _cancelled_charges integer := 0;
  _cancelled_attempts integer := 0;
  _facts integer := 0;
begin
  select * into _o
  from public.orders o
  where o.id=_order_id
  for update;

  if _o.id is null then raise exception 'Order not found'; end if;

  select op.code into _op_code
  from public.operations op
  where op.id=_o.operation_id and op.tenant_id=_o.tenant_id;

  select p.email into _buyer_email
  from public.people p
  where p.id=_o.buyer_person_id and p.tenant_id=_o.tenant_id;
  if _op_code <> 'TEAM-SEFFRIN-BSB-20270416' then raise exception 'Order is not Team Seffrin QA'; end if;
  if coalesce((_o.metadata->>'qa_public_checkout')::boolean,false) is not true then
    raise exception 'Order is not marked as QA public checkout';
  end if;
  if coalesce(_o.metadata->>'qa_environment','') <> 'test' then
    raise exception 'QA environment is not test';
  end if;
  if _o.buyer_name_snapshot not like 'QA %' or coalesce(_buyer_email,'') not like '%@example.com' then
    raise exception 'Synthetic QA buyer identity required';
  end if;

  select count(*) into _facts
  from public.financial_facts f
  where f.tenant_id=_o.tenant_id
    and f.order_id=_o.id
    and f.fact_type='PAYMENT_RECORDED';

  if _facts > 0 then
    raise exception 'QA cleanup refused: recorded financial facts exist';
  end if;

  -- Retire local TEST attempts/charges that never settled.
  update public.payment_attempts a
     set status='cancelled', updated_at=now()
   where a.tenant_id=_o.tenant_id
     and a.charge_id in (
       select c.id from public.payment_charges c
       where c.tenant_id=_o.tenant_id
         and c.order_id=_o.id
         and coalesce(c.metadata->>'environment','')='test'
     )
     and a.status in ('created','pending','processing');
  get diagnostics _cancelled_attempts = row_count;

  update public.payment_charges c
     set status='cancelled', cancelled_at=coalesce(cancelled_at,now()), updated_at=now()
   where c.tenant_id=_o.tenant_id
     and c.order_id=_o.id
     and coalesce(c.metadata->>'environment','')='test'
     and c.status in ('draft','pending','processing','failed');
  get diagnostics _cancelled_charges = row_count;

  for _res in
    select r.id
    from public.commercial_reservations r
    where r.tenant_id=_o.tenant_id
      and r.order_id=_o.id
      and r.status in ('reserved','confirmed')
    order by r.offering_id,r.id
  loop
    if app_private.w09_release_reservation(_res.id,'Team Seffrin QA smoke cleanup',true) then
      _released := _released + 1;
    end if;
  end loop;

  update public.public_checkout_sessions
     set status='revoked', updated_at=now()
   where tenant_id=_o.tenant_id
     and order_id=_o.id
     and status='active';

  perform set_config('app.w09_control','on',true);
  update public.orders
     set status='cancelled',
         cancelled_at=coalesce(cancelled_at,now()),
         cancelled_by=null,
         cancellation_reason='Team Seffrin QA smoke cleanup'
   where id=_o.id
     and tenant_id=_o.tenant_id
     and status<>'cancelled';
  perform set_config('app.w09_control','off',true);

  perform app_private.record_audit_event(
    _o.tenant_id,null,'commerce.qa_order_cleaned',
    'order',_o.id,null,
    jsonb_build_object(
      'operation_code',_op_code,
      'released_reservations',_released,
      'cancelled_test_charges',_cancelled_charges,
      'cancelled_attempts',_cancelled_attempts
    )
  );

  return jsonb_build_object(
    'order_id',_o.id,
    'status','cancelled',
    'released_reservations',_released,
    'cancelled_test_charges',_cancelled_charges,
    'cancelled_attempts',_cancelled_attempts,
    'financial_facts_recorded',0
  );
end;
$function$;

revoke all on function public.cleanup_team_seffrin_qa_order(uuid) from public,anon,authenticated;
grant execute on function public.cleanup_team_seffrin_qa_order(uuid) to service_role;
