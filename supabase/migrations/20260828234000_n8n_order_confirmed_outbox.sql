-- COBS OS · order.confirmed transactional outbox
-- Canonical commercial truth remains in public.orders. This migration only
-- materializes a pending automation event after the real status transition.

alter table public.automation_events
  drop constraint if exists automation_events_check;

alter table public.automation_events
  add constraint automation_events_operation_context_check
  check (
    operation_id is not null
    or event_type in ('lead.created', 'order.confirmed')
  );

create or replace function app_private.enqueue_order_confirmed_automation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
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
    tenant_id,
    operation_id,
    actor_profile_id,
    event_type,
    source,
    idempotency_key,
    correlation_id,
    payload
  )
  values (
    new.tenant_id,
    new.operation_id,
    new.confirmed_by,
    'order.confirmed',
    'cobs_db',
    _idempotency_key,
    _correlation_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'order_id', new.id,
        'reference_label', new.reference_label,
        'grand_total_minor', new.grand_total_minor,
        'currency', btrim(new.currency::text),
        'confirmed_at', new.confirmed_at,
        'confirmation_mode', _confirmation_mode,
        'provider', _provider
      )
    )
  )
  on conflict (tenant_id, source, idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function app_private.enqueue_order_confirmed_automation_event()
  from public, anon, authenticated;

drop trigger if exists orders_enqueue_order_confirmed_automation_event on public.orders;

create trigger orders_enqueue_order_confirmed_automation_event
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function app_private.enqueue_order_confirmed_automation_event();

comment on function app_private.enqueue_order_confirmed_automation_event() is
  'Creates one pending order.confirmed automation event when an order actually transitions to confirmed.';
