create or replace function app_private.enqueue_order_confirmed_automation_event()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _idempotency_key text;
  _correlation_id text;
  _confirmation_mode text;
  _provider text;
begin
  if old.status is not distinct from new.status or new.status::text <> 'confirmed' then
    return new;
  end if;

  _idempotency_key := 'order.confirmed:' || new.id::text;
  _correlation_id := gen_random_uuid()::text;
  _confirmation_mode := case when new.confirmed_by is null then 'provider' else 'manual' end;
  _provider := nullif(new.metadata #>> '{provider_confirmation,provider}', '');

  insert into public.automation_events (
    tenant_id, operation_id, actor_profile_id, event_type, source,
    idempotency_key, correlation_id, payload
  )
  values (
    new.tenant_id,
    new.operation_id,
    new.confirmed_by,
    'order.confirmed',
    'cobs_db',
    _idempotency_key,
    _correlation_id,
    jsonb_strip_nulls(jsonb_build_object(
      'order_id', new.id,
      'reference_label', new.reference_label,
      'grand_total_minor', new.grand_total_minor,
      'currency', btrim(new.currency::text),
      'confirmed_at', new.confirmed_at,
      'confirmation_mode', _confirmation_mode,
      'provider', _provider
    ))
  )
  on conflict (tenant_id, source, idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function app_private.enqueue_order_confirmed_automation_event() from public, anon, authenticated, service_role;
grant execute on function app_private.enqueue_order_confirmed_automation_event() to postgres;

drop trigger if exists orders_enqueue_order_confirmed_automation_event on public.orders;
create trigger orders_enqueue_order_confirmed_automation_event
after update on public.orders
for each row
execute function app_private.enqueue_order_confirmed_automation_event();

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
    where e.source = 'cobs_db'
      and e.event_type = 'order.confirmed'
      and e.dispatch_status in ('pending','failed')
      and e.dispatch_attempts < 3
    order by e.created_at asc
    for update skip locked
    limit _safe_limit
  )
  update public.automation_events e
  set dispatch_status = 'processing',
      dispatch_attempts = e.dispatch_attempts + 1,
      last_error_code = null,
      last_error_message = null
  from candidates c
  where e.id = c.id
  returning e.*;
end;
$$;

revoke all on function public.claim_automation_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_automation_outbox(integer) to postgres, service_role;