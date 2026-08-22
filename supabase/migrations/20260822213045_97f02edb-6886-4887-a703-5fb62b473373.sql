-- COBS OS · MP-01 HARDENING GATE (additive)

-- 4. No double accounting: at most one effective PAYMENT_APPROVED per attempt.
create unique index if not exists payment_events_single_approval_key
  on public.payment_events (payment_attempt_id)
  where event_type = 'PAYMENT_APPROVED' and payment_attempt_id is not null;

-- 3. Authenticated payer may create an attempt for their own charge.
create or replace function public.create_payment_attempt(
  _payment_order_id uuid,
  _payment_method text,
  _idempotency_key text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare
  _order public.payment_orders;
  _account public.payment_provider_accounts;
  _row public.payment_attempts;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _status public.payment_order_status;
  _id uuid := gen_random_uuid();
  _outstanding numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _order from public.payment_orders o where o.id = _payment_order_id;
  if _order.id is null then raise exception 'Payment order not found'; end if;
  -- Operators act for the tenant; the charged person acts only for themselves.
  if not (app_private.has_tenant_role(
            _order.tenant_id, array['owner','admin','operations_agent']::public.app_role[])
          or app_private.mp_is_payer(_order.tenant_id, _order.person_id)) then
    raise exception 'You do not have permission for this payment order';
  end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _payment_method is null or _payment_method not in ('pix','credit_card','boleto') then
    raise exception 'Unsupported payment method';
  end if;

  select * into _row from public.payment_attempts a
   where a.tenant_id = _order.tenant_id and a.idempotency_key = _key;
  if _row.id is not null then
    if _row.payment_order_id is distinct from _order.id then
      raise exception 'Idempotency key already used for another payment order';
    end if;
    return jsonb_build_object(
      'payment_attempt_id', _row.id, 'external_reference', _row.external_reference,
      'amount', _row.amount, 'currency', _row.currency,
      'payment_method', _row.payment_method, 'idempotent_replay', true);
  end if;

  _status := app_private.mp_sync_status(_order.id);
  if _status not in ('open','partially_paid','overdue') then
    raise exception 'A % payment order no longer accepts payment attempts', _status;
  end if;

  _outstanding := (app_private.mp_order_totals(_order)->>'outstanding')::numeric;
  if _outstanding <= 0 then raise exception 'This payment order has nothing outstanding'; end if;

  select * into _account from public.payment_provider_accounts pa
   where pa.tenant_id = _order.tenant_id and pa.provider = 'mercadopago' and pa.is_active
   order by (pa.environment = 'sandbox') desc limit 1;
  if _account.id is null then
    raise exception 'No active payment provider account is configured for this tenant';
  end if;

  perform set_config('app.mp_control','on', true);
  insert into public.payment_attempts (
    id, tenant_id, payment_order_id, provider, provider_account_id, payment_method,
    amount, currency, external_reference, idempotency_key, created_by)
  values (_id, _order.tenant_id, _order.id, _account.provider, _account.id, _payment_method,
          _outstanding, _order.currency, 'cobs:' || _id::text, _key, auth.uid())
  returning * into _row;

  insert into public.payment_events (
    tenant_id, payment_order_id, payment_attempt_id, event_type, amount,
    actor_profile_id, provider, payload, idempotency_key)
  values (_order.tenant_id, _order.id, _row.id, 'PAYMENT_ATTEMPT_CREATED', _row.amount,
          auth.uid(), _account.provider,
          jsonb_build_object('payment_method', _payment_method,
                             'external_reference', _row.external_reference), _key);
  perform set_config('app.mp_control','off', true);

  perform app_private.record_audit_event(_order.tenant_id, auth.uid(),
    'finance.payment_attempt_created', 'payment_attempt', _row.id, _key,
    jsonb_build_object('payment_order_id', _order.id, 'amount', _row.amount,
                       'payment_method', _payment_method));

  -- 8. secret_reference is never returned to a client.
  return jsonb_build_object(
    'payment_attempt_id', _row.id, 'external_reference', _row.external_reference,
    'amount', _row.amount, 'currency', _row.currency,
    'payment_method', _row.payment_method, 'provider', _row.provider,
    'provider_account_id', _account.id, 'environment', _account.environment,
    'idempotent_replay', false);
end;
$$;

-- 5. Unambiguous correlation + single effective approval.
create or replace function public.record_provider_payment_event(
  _provider text,
  _event_type public.payment_event_type,
  _external_reference text default null,
  _provider_payment_id text default null,
  _provider_event_id text default null,
  _provider_status text default null,
  _provider_status_detail text default null,
  _amount numeric default null,
  _occurred_at timestamptz default null,
  _payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public' as $$
declare
  _attempt public.payment_attempts;
  _by_ref public.payment_attempts;
  _by_id public.payment_attempts;
  _order public.payment_orders;
  _event_id uuid;
begin
  if _provider is null then raise exception 'Provider is required'; end if;

  if _provider_event_id is not null and exists (
    select 1 from public.payment_events e
     where e.provider = _provider and e.provider_event_id = _provider_event_id)
  then
    return jsonb_build_object('duplicate', true, 'recorded', false);
  end if;

  if _external_reference is not null then
    select * into _by_ref from public.payment_attempts a
     where a.external_reference = _external_reference;
  end if;
  if _provider_payment_id is not null then
    select * into _by_id from public.payment_attempts a
     where a.provider = _provider and a.provider_payment_id = _provider_payment_id;
  end if;

  if _by_ref.id is not null and _by_id.id is not null and _by_ref.id <> _by_id.id then
    raise exception 'Provider correlation mismatch: reference and payment identify different attempts';
  end if;

  _attempt := coalesce(_by_ref, _by_id);
  if _attempt.id is null then
    return jsonb_build_object('duplicate', false, 'recorded', false, 'reason', 'unmatched');
  end if;

  -- One provider payment can only be approved once for balance purposes.
  if _event_type = 'PAYMENT_APPROVED' and exists (
    select 1 from public.payment_events e
     where e.payment_attempt_id = _attempt.id and e.event_type = 'PAYMENT_APPROVED')
  then
    return jsonb_build_object(
      'duplicate', true, 'recorded', false, 'reason', 'already_approved',
      'payment_attempt_id', _attempt.id,
      'status', app_private.mp_sync_status(_attempt.payment_order_id));
  end if;

  select * into _order from public.payment_orders o where o.id = _attempt.payment_order_id;

  perform set_config('app.mp_control','on', true);
  update public.payment_attempts
     set provider_payment_id = coalesce(_provider_payment_id, provider_payment_id),
         provider_status = coalesce(_provider_status, provider_status),
         provider_status_detail = coalesce(_provider_status_detail, provider_status_detail)
   where id = _attempt.id;

  insert into public.payment_events (
    tenant_id, payment_order_id, payment_attempt_id, event_type, amount,
    occurred_at, provider, provider_event_id, payload)
  values (_attempt.tenant_id, _order.id, _attempt.id, _event_type,
          case when _event_type in ('PAYMENT_APPROVED','PAYMENT_REFUNDED')
               then coalesce(_amount, _attempt.amount) else null end,
          coalesce(_occurred_at, now()), _provider, _provider_event_id,
          coalesce(_payload, '{}'::jsonb))
  returning id into _event_id;
  perform set_config('app.mp_control','off', true);

  perform app_private.record_audit_event(_attempt.tenant_id, null,
    'finance.payment_provider_event_recorded', 'payment_event', _event_id, _provider_event_id,
    jsonb_build_object('event_type', _event_type, 'provider', _provider,
                       'payment_order_id', _order.id, 'payment_attempt_id', _attempt.id));

  return jsonb_build_object(
    'duplicate', false, 'recorded', true, 'payment_event_id', _event_id,
    'payment_order_id', _order.id, 'payment_attempt_id', _attempt.id,
    'status', app_private.mp_sync_status(_order.id));
end;
$$;

revoke all on function public.create_payment_attempt(uuid, text, text) from public, anon;
grant execute on function public.create_payment_attempt(uuid, text, text) to authenticated;
revoke all on function public.record_provider_payment_event(text, public.payment_event_type, text, text, text, text, text, numeric, timestamptz, jsonb) from public, anon, authenticated;