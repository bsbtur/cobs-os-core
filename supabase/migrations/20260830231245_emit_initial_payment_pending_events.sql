create or replace function public.emit_initial_payment_pending_events(_limit integer default 25)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _safe_limit integer := greatest(1, least(coalesce(_limit, 25), 100));
  _inserted integer := 0;
begin
  with candidates as (
    select
      a.id as payment_attempt_id,
      a.tenant_id,
      a.charge_id,
      a.method::text as method,
      a.status::text as payment_status,
      a.provider::text as provider,
      a.amount_minor,
      a.provider_order_id,
      a.expires_at,
      c.order_id,
      c.currency::text as currency,
      c.due_at,
      o.operation_id,
      o.reference_label
    from public.payment_attempts a
    join public.payment_charges c
      on c.id = a.charge_id
     and c.tenant_id = a.tenant_id
    join public.orders o
      on o.id = c.order_id
     and o.tenant_id = c.tenant_id
    where a.status::text = 'pending'
      and a.method::text = 'pix'
      and a.created_at <= now() - interval '15 minutes'
      and (a.expires_at is null or a.expires_at > now())
      and c.status::text not in ('paid','cancelled')
    order by a.created_at asc
    limit _safe_limit
  ), inserted as (
    insert into public.automation_events (
      tenant_id,
      operation_id,
      actor_profile_id,
      event_type,
      source,
      idempotency_key,
      correlation_id,
      payload,
      dispatch_status
    )
    select
      x.tenant_id,
      x.operation_id,
      null,
      'payment.pending',
      'cobs_db',
      'payment.pending:' || x.payment_attempt_id::text || ':initial',
      'payment-pending:' || x.payment_attempt_id::text || ':initial',
      jsonb_build_object(
        'payment_attempt_id', x.payment_attempt_id,
        'charge_id', x.charge_id,
        'order_id', x.order_id,
        'amount_minor', x.amount_minor,
        'currency', x.currency,
        'method', x.method,
        'payment_status', x.payment_status,
        'provider', x.provider,
        'provider_order_id', x.provider_order_id,
        'expires_at', x.expires_at,
        'due_at', x.due_at,
        'reference_label', x.reference_label,
        'is_test', false,
        'reminder_stage', 'initial'
      ),
      'pending'
    from candidates x
    on conflict (tenant_id, source, idempotency_key) do nothing
    returning 1
  )
  select count(*) into _inserted from inserted;

  return _inserted;
end;
$function$;

revoke all on function public.emit_initial_payment_pending_events(integer) from public;

DO $do$
declare
  _jobid bigint;
begin
  select jobid into _jobid
  from cron.job
  where jobname = 'cobs-payment-pending-initial-emitter'
  limit 1;

  if _jobid is not null then
    perform cron.unschedule(_jobid);
  end if;

  perform cron.schedule(
    'cobs-payment-pending-initial-emitter',
    '*/5 * * * *',
    'select public.emit_initial_payment_pending_events(25);'
  );
end;
$do$;