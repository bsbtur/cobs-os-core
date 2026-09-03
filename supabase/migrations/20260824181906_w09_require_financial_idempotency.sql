create or replace function app_private.w09_require_financial_idempotency(_key text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog','public'
as $function$
declare _clean text := nullif(btrim(coalesce(_key,'')),'');
begin
  if _clean is null then
    raise exception 'An idempotency key is required for financial mutations';
  end if;
  if char_length(_clean) > 200 then
    raise exception 'The idempotency key is too long';
  end if;
  return _clean;
end;
$function$;

create or replace function public.record_payment(
  _order_id uuid,
  _amount_minor bigint,
  _method public.payment_method,
  _reference text,
  _reason text,
  _occurred_at timestamptz default null,
  _idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _o public.orders;
  _id uuid;
  _ref text;
  _rsn text;
  _at timestamptz;
  _key text;
  _existing jsonb;
begin
  _key := app_private.w09_require_financial_idempotency(_idempotency_key);

  select * into _o from public.orders o where o.id = _order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;
  perform app_private.w09_require_finance_manager(_o.tenant_id);

  select k.result into _existing
    from public.idempotency_keys k
   where k.actor_profile_id = auth.uid()
     and k.action = 'commerce.payment_record'
     and k.idempotency_key = _key;
  if _existing is not null then return (_existing->>'fact_id')::uuid; end if;

  if _o.status not in ('submitted','confirmed','completed') then
    raise exception 'A payment can only be recorded against a submitted, confirmed or completed order';
  end if;
  if _amount_minor is null or _amount_minor <= 0 then
    raise exception 'The payment amount must be greater than zero';
  end if;
  if _method is null then raise exception 'A payment method is required'; end if;

  _ref := app_private.w09_content_guard(_reference);
  if _ref is null then raise exception 'An evidence reference is required'; end if;
  _rsn := app_private.w09_content_guard(_reason);
  if _rsn is null then raise exception 'A reason is required'; end if;

  _at := coalesce(_occurred_at, now());
  if _at > now() then raise exception 'A payment cannot be recorded in the future'; end if;

  perform 1 from public.financial_facts f where f.order_id = _order_id for update;

  perform set_config('app.w09_control','on', true);
  insert into public.financial_facts
    (tenant_id, order_id, fact_type, amount_minor, currency, method, reference, reason,
     occurred_at, actor_profile_id)
  values (_o.tenant_id, _order_id, 'PAYMENT_RECORDED', _amount_minor, _o.currency,
          _method, _ref, _rsn, _at, auth.uid())
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_o.tenant_id, auth.uid(), 'commerce.payment_record', _key,
          jsonb_build_object('fact_id', _id));

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.payment_recorded',
    'financial_fact', _id, null, jsonb_build_object('order_id', _order_id,
      'amount_minor', _amount_minor, 'method', _method));
  return _id;
end;
$function$;

create or replace function public.record_refund(
  _payment_fact_id uuid,
  _amount_minor bigint,
  _reason text,
  _reference text,
  _occurred_at timestamptz default null,
  _idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _p public.financial_facts;
  _o public.orders;
  _id uuid;
  _ref text;
  _rsn text;
  _at timestamptz;
  _key text;
  _existing jsonb;
begin
  _key := app_private.w09_require_financial_idempotency(_idempotency_key);

  select * into _p from public.financial_facts f where f.id = _payment_fact_id;
  if _p.id is null then raise exception 'Payment not found'; end if;
  select * into _o from public.orders o where o.id = _p.order_id for update;
  perform app_private.w09_require_finance_manager(_o.tenant_id);

  select k.result into _existing
    from public.idempotency_keys k
   where k.actor_profile_id = auth.uid()
     and k.action = 'commerce.refund_record'
     and k.idempotency_key = _key;
  if _existing is not null then return (_existing->>'fact_id')::uuid; end if;

  if _amount_minor is null or _amount_minor <= 0 then
    raise exception 'The refund amount must be greater than zero';
  end if;

  perform 1 from public.financial_facts f where f.order_id = _o.id for update;
  perform app_private.w09_assert_refund_allowed(_o.id, _payment_fact_id, _amount_minor);

  _ref := app_private.w09_content_guard(_reference);
  if _ref is null then raise exception 'An evidence reference is required'; end if;
  _rsn := app_private.w09_content_guard(_reason);
  if _rsn is null then raise exception 'A reason is required'; end if;
  _at := coalesce(_occurred_at, now());
  if _at > now() then raise exception 'A refund cannot be recorded in the future'; end if;

  perform set_config('app.w09_control','on', true);
  insert into public.financial_facts
    (tenant_id, order_id, fact_type, amount_minor, currency, reference, reason,
     references_fact_id, occurred_at, actor_profile_id)
  values (_o.tenant_id, _o.id, 'REFUND_RECORDED', _amount_minor, _p.currency,
          _ref, _rsn, _payment_fact_id, _at, auth.uid())
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_o.tenant_id, auth.uid(), 'commerce.refund_record', _key,
          jsonb_build_object('fact_id', _id));

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.refund_recorded',
    'financial_fact', _id, null, jsonb_build_object('payment_fact_id', _payment_fact_id,
      'amount_minor', _amount_minor));
  return _id;
end;
$function$;

create or replace function public.reverse_payment(
  _payment_fact_id uuid,
  _reason text,
  _reference text,
  _occurred_at timestamptz default null,
  _idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _p public.financial_facts;
  _o public.orders;
  _id uuid;
  _ref text;
  _rsn text;
  _at timestamptz;
  _key text;
  _existing jsonb;
begin
  _key := app_private.w09_require_financial_idempotency(_idempotency_key);

  select * into _p from public.financial_facts f where f.id = _payment_fact_id;
  if _p.id is null then raise exception 'Payment not found'; end if;
  select * into _o from public.orders o where o.id = _p.order_id for update;
  perform app_private.w09_require_finance_manager(_o.tenant_id);

  select k.result into _existing
    from public.idempotency_keys k
   where k.actor_profile_id = auth.uid()
     and k.action = 'commerce.payment_reverse'
     and k.idempotency_key = _key;
  if _existing is not null then return (_existing->>'fact_id')::uuid; end if;

  if _p.fact_type <> 'PAYMENT_RECORDED' then
    raise exception 'Only a recorded payment can be reversed';
  end if;

  perform 1 from public.financial_facts f where f.order_id = _o.id for update;

  if exists (select 1 from public.financial_facts f
              where f.references_fact_id = _payment_fact_id
                and f.fact_type = 'PAYMENT_REVERSED') then
    raise exception 'This payment has already been reversed';
  end if;
  if exists (select 1 from public.financial_facts f
              where f.references_fact_id = _payment_fact_id
                and f.fact_type = 'REFUND_RECORDED') then
    raise exception 'This payment has refunds and can no longer be reversed';
  end if;

  _ref := app_private.w09_content_guard(_reference);
  if _ref is null then raise exception 'An evidence reference is required'; end if;
  _rsn := app_private.w09_content_guard(_reason);
  if _rsn is null then raise exception 'A reason is required'; end if;
  _at := coalesce(_occurred_at, now());
  if _at > now() then raise exception 'A correction cannot be recorded in the future'; end if;

  perform set_config('app.w09_control','on', true);
  insert into public.financial_facts
    (tenant_id, order_id, fact_type, amount_minor, currency, reference, reason,
     references_fact_id, occurred_at, actor_profile_id)
  values (_o.tenant_id, _o.id, 'PAYMENT_REVERSED', _p.amount_minor, _p.currency,
          _ref, _rsn, _payment_fact_id, _at, auth.uid())
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_o.tenant_id, auth.uid(), 'commerce.payment_reverse', _key,
          jsonb_build_object('fact_id', _id));

  perform app_private.record_audit_event(_o.tenant_id, auth.uid(), 'commerce.payment_reversed',
    'financial_fact', _id, null, jsonb_build_object('payment_fact_id', _payment_fact_id));
  return _id;
end;
$function$;

comment on function app_private.w09_require_financial_idempotency(text) is
'Requires a bounded non-empty idempotency key for financial mutations so retries cannot create duplicate financial facts.';