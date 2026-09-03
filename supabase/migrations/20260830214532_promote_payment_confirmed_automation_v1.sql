create or replace function app_private.enqueue_payment_confirmed_automation_event()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _operation_id uuid;
  _reference_label text;
begin
  if new.fact_type::text <> 'PAYMENT_RECORDED' then
    return new;
  end if;

  select o.operation_id,o.reference_label
    into _operation_id,_reference_label
    from public.orders o
   where o.id=new.order_id
     and o.tenant_id=new.tenant_id;

  if _operation_id is null then
    return new;
  end if;

  insert into public.automation_events(
    tenant_id,operation_id,actor_profile_id,event_type,source,
    idempotency_key,correlation_id,payload
  ) values (
    new.tenant_id,_operation_id,new.actor_profile_id,'payment.confirmed','cobs_db',
    'payment.confirmed:' || new.id::text,
    coalesce(nullif(btrim(new.correlation_id),''),gen_random_uuid()::text),
    jsonb_strip_nulls(jsonb_build_object(
      'financial_fact_id',new.id,
      'order_id',new.order_id,
      'operation_id',_operation_id,
      'reference_label',_reference_label,
      'amount_minor',new.amount_minor,
      'currency',btrim(new.currency::text),
      'method',new.method::text,
      'reference',new.reference,
      'occurred_at',new.occurred_at
    ))
  )
  on conflict (tenant_id,source,idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function app_private.enqueue_payment_confirmed_automation_event() from public,anon,authenticated,service_role;
grant execute on function app_private.enqueue_payment_confirmed_automation_event() to postgres;

drop trigger if exists financial_facts_enqueue_payment_confirmed_automation_event on public.financial_facts;
create trigger financial_facts_enqueue_payment_confirmed_automation_event
after insert on public.financial_facts
for each row
when (new.fact_type = 'PAYMENT_RECORDED'::public.financial_fact_type)
execute function app_private.enqueue_payment_confirmed_automation_event();

create or replace function public.claim_automation_outbox(_limit integer default 10)
returns setof public.automation_events
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _safe_limit integer := greatest(1, least(coalesce(_limit, 10), 50));
begin
  return query
  with candidates as (
    select e.id
    from public.automation_events e
    where e.source='cobs_db'
      and e.event_type in ('order.confirmed','participant.added','payment.confirmed')
      and e.dispatch_status in ('pending','failed')
      and e.dispatch_attempts < 3
    order by e.created_at asc
    for update skip locked
    limit _safe_limit
  )
  update public.automation_events e
  set dispatch_status='processing',
      dispatch_attempts=e.dispatch_attempts+1,
      last_error_code=null,
      last_error_message=null
  from candidates c
  where e.id=c.id
  returning e.*;
end;
$$;

revoke all on function public.claim_automation_outbox(integer) from public,anon,authenticated;
grant execute on function public.claim_automation_outbox(integer) to postgres,service_role;