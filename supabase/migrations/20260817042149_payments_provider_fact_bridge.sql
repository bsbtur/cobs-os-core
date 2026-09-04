create or replace function public.record_provider_payment(
  _order_id uuid,
  _amount_minor bigint,
  _reference text,
  _reason text,
  _occurred_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _o public.orders;
  _existing uuid;
  _id uuid;
  _ref text;
  _rsn text;
  _at timestamptz;
begin
  select * into _o from public.orders o where o.id = _order_id for update;
  if _o.id is null then raise exception 'Order not found'; end if;
  if _amount_minor is null or _amount_minor <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  _ref := app_private.w09_content_guard(_reference);
  _rsn := app_private.w09_content_guard(_reason);
  if _ref is null then raise exception 'Provider reference is required'; end if;
  if _rsn is null then raise exception 'Reason is required'; end if;
  _at := coalesce(_occurred_at, now());

  select f.id into _existing
    from public.financial_facts f
   where f.order_id = _order_id
     and f.fact_type = 'PAYMENT_RECORDED'
     and f.reference = _ref
   limit 1;
  if _existing is not null then return _existing; end if;

  perform set_config('app.w09_control','on', true);
  insert into public.financial_facts
    (tenant_id, order_id, fact_type, amount_minor, currency, method, reference, reason, occurred_at, actor_profile_id)
  values
    (_o.tenant_id, _order_id, 'PAYMENT_RECORDED', _amount_minor, _o.currency, 'bank_transfer', _ref, _rsn, _at, null)
  returning id into _id;
  perform set_config('app.w09_control','off', true);

  return _id;
end;
$$;

revoke all on function public.record_provider_payment(uuid,bigint,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.record_provider_payment(uuid,bigint,text,text,timestamptz) to service_role;