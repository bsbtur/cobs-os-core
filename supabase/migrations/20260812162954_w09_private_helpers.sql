-- ===================================================================
-- COBS OS · W09 — PRIVATE HELPERS (18)
-- ===================================================================

-- 1
create or replace function app_private.w09_require_commerce_read(_tenant_id uuid)
returns void language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id,
       array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have access to commerce in this organization';
  end if;
end; $$;

-- 2
create or replace function app_private.w09_require_commerce_manager(_tenant_id uuid)
returns void language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id,
       array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and administrators can perform this commerce action';
  end if;
end; $$;

-- 3
create or replace function app_private.w09_require_order_editor(_tenant_id uuid)
returns void language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id,
       array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to manage orders in this organization';
  end if;
end; $$;

-- 4
create or replace function app_private.w09_require_finance_manager(_tenant_id uuid)
returns void language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_tenant_role(_tenant_id,
       array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and administrators can record financial facts';
  end if;
end; $$;

-- 5
create or replace function app_private.w09_validate_currency(_code text)
returns char(3) language plpgsql immutable
set search_path to 'pg_catalog','public' as $$
declare _c text := upper(btrim(coalesce(_code,'')));
begin
  if _c !~ '^[A-Z]{3}$' then
    raise exception 'Invalid currency code: %', coalesce(_code,'(null)');
  end if;
  return _c::char(3);
end; $$;

-- 6
create or replace function app_private.w09_checked_mul(_a bigint, _b bigint)
returns bigint language plpgsql immutable
set search_path to 'pg_catalog','public' as $$
declare _r numeric := (_a::numeric) * (_b::numeric);
begin
  if _r > 9223372036854775807::numeric or _r < (-9223372036854775808)::numeric then
    raise exception 'Monetary amount out of range';
  end if;
  return _r::bigint;
end; $$;

-- 7
create or replace function app_private.w09_compute_order_totals(_order_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _sub numeric; _disc numeric; _grand numeric;
begin
  select coalesce(sum(i.line_subtotal_minor::numeric),0),
         coalesce(sum(i.discount_minor::numeric),0),
         coalesce(sum(i.line_total_minor::numeric),0)
    into _sub, _disc, _grand
    from public.order_items i where i.order_id = _order_id;
  if _grand > 9223372036854775807::numeric or _sub > 9223372036854775807::numeric then
    raise exception 'Order total out of range';
  end if;
  return jsonb_build_object(
    'subtotal_minor', _sub::bigint,
    'discount_total_minor', _disc::bigint,
    'grand_total_minor', _grand::bigint);
end; $$;

-- 8
create or replace function app_private.w09_reservation_ttl(_tenant_id uuid)
returns interval language sql immutable
set search_path to 'pg_catalog','public' as $$
  select interval '30 minutes'
$$;

-- 9
create or replace function app_private.w09_lock_offering_capacity(_offering_id uuid)
returns void language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('w09:offering:' || _offering_id::text, 0));
  perform 1 from public.commercial_reservations r
    where r.offering_id = _offering_id for update;
end; $$;

-- 10
create or replace function app_private.w09_materialize_expired_reservations(_offering_id uuid)
returns integer language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _n integer;
begin
  perform set_config('app.w09_control','on', true);
  with upd as (
    update public.commercial_reservations r
       set status = 'expired', expired_at = now()
     where r.offering_id = _offering_id
       and r.status = 'reserved'
       and r.expires_at <= now()
    returning 1)
  select count(*) into _n from upd;
  perform set_config('app.w09_control','off', true);
  return _n;
end; $$;

-- 11
create or replace function app_private.w09_effective_occupancy(_offering_id uuid)
returns bigint language sql stable security definer
set search_path to 'pg_catalog','public' as $$
  select coalesce(sum(r.quantity)::bigint, 0)
    from public.commercial_reservations r
   where r.offering_id = _offering_id
     and (r.status = 'confirmed'
          or (r.status = 'reserved' and r.expires_at > now()))
$$;

-- 12
create or replace function app_private.w09_assert_capacity_available(
  _offering_id uuid, _quantity integer, _exclude_reservation_id uuid default null)
returns void language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _cap integer; _used bigint;
begin
  select o.capacity into _cap from public.offerings o where o.id = _offering_id;
  if _cap is null then return; end if;
  select coalesce(sum(r.quantity)::bigint, 0) into _used
    from public.commercial_reservations r
   where r.offering_id = _offering_id
     and (_exclude_reservation_id is null or r.id <> _exclude_reservation_id)
     and (r.status = 'confirmed'
          or (r.status = 'reserved' and r.expires_at > now()));
  if _used + _quantity > _cap then
    raise exception 'Not enough commercial capacity for this offering (capacity %, in use %, requested %)',
      _cap, _used, _quantity;
  end if;
end; $$;

-- 13
create or replace function app_private.w09_reserve_or_reacquire(
  _item public.order_items, _target public.commercial_reservation_status)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _existing public.commercial_reservations; _id uuid; _now timestamptz := now();
begin
  if _item.offering_id is null then return null; end if;
  if _target not in ('reserved','confirmed') then
    raise exception 'Invalid reservation target state';
  end if;

  perform app_private.w09_lock_offering_capacity(_item.offering_id);
  perform app_private.w09_materialize_expired_reservations(_item.offering_id);

  select * into _existing from public.commercial_reservations r
   where r.order_item_id = _item.id and r.status in ('reserved','confirmed')
   order by r.created_at desc limit 1;

  perform set_config('app.w09_control','on', true);

  if _existing.id is not null then
    if _target = 'confirmed' and _existing.status = 'reserved' then
      update public.commercial_reservations
         set status = 'confirmed', confirmed_at = _now
       where id = _existing.id;
    end if;
    perform set_config('app.w09_control','off', true);
    return _existing.id;
  end if;

  perform app_private.w09_assert_capacity_available(_item.offering_id, _item.quantity, null);

  insert into public.commercial_reservations
    (tenant_id, order_id, order_item_id, offering_id, quantity, status,
     expires_at, confirmed_at, created_by,
     reacquired_from_reservation_id)
  values (_item.tenant_id, _item.order_id, _item.id, _item.offering_id, _item.quantity,
          _target,
          case when _target = 'reserved'
               then _now + app_private.w09_reservation_ttl(_item.tenant_id) else null end,
          case when _target = 'confirmed' then _now else null end,
          auth.uid(),
          (select r.id from public.commercial_reservations r
            where r.order_item_id = _item.id
              and r.status in ('expired','released')
            order by r.created_at desc limit 1))
  returning id into _id;

  perform set_config('app.w09_control','off', true);
  return _id;
end; $$;

-- 14
create or replace function app_private.w09_release_reservation(
  _reservation_id uuid, _reason text, _allow_confirmed boolean default false)
returns boolean language plpgsql security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.commercial_reservations; _reason_clean text;
begin
  _reason_clean := app_private.w09_content_guard(_reason);
  if _reason_clean is null then
    raise exception 'A reason is required to release commercial capacity';
  end if;

  select * into _row from public.commercial_reservations r
   where r.id = _reservation_id for update;
  if _row.id is null then raise exception 'Reservation not found'; end if;

  perform app_private.w09_lock_offering_capacity(_row.offering_id);
  perform app_private.w09_materialize_expired_reservations(_row.offering_id);
  select * into _row from public.commercial_reservations r where r.id = _reservation_id;

  if _row.status in ('released','expired') then
    return false;
  end if;

  if _row.status = 'confirmed' and not _allow_confirmed then
    raise exception 'A confirmed commercial reservation can only be released by cancelling its order';
  end if;

  perform set_config('app.w09_control','on', true);
  update public.commercial_reservations
     set status = 'released', released_at = now(),
         released_reason = _reason_clean, released_by = auth.uid()
   where id = _reservation_id;
  perform set_config('app.w09_control','off', true);
  return true;
end; $$;

-- 15
create or replace function app_private.w09_resolve_active_price(
  _sellable_id uuid, _currency char(3))
returns public.prices language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _row public.prices;
begin
  select * into _row from public.prices p
   where p.sellable_id = _sellable_id
     and p.currency = _currency
     and p.status = 'active'
     and p.valid_from <= now()
     and (p.valid_until is null or p.valid_until > now())
   limit 1;
  if _row.id is null then
    raise exception 'No active price exists for this item in %', _currency;
  end if;
  return _row;
end; $$;

-- 16
create or replace function app_private.w09_order_financial_state(_order_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _gross bigint; _rev bigint; _ref bigint; _valid bigint; _net bigint;
        _total bigint; _cur char(3);
begin
  select o.grand_total_minor, o.currency into _total, _cur
    from public.orders o where o.id = _order_id;
  select coalesce(sum(f.amount_minor) filter (where f.fact_type='PAYMENT_RECORDED'),0),
         coalesce(sum(f.amount_minor) filter (where f.fact_type='PAYMENT_REVERSED'),0),
         coalesce(sum(f.amount_minor) filter (where f.fact_type='REFUND_RECORDED'),0)
    into _gross, _rev, _ref
    from public.financial_facts f where f.order_id = _order_id;
  _valid := _gross - _rev;
  _net := _valid - _ref;
  return jsonb_build_object(
    'currency', _cur,
    'grand_total_minor', coalesce(_total, 0),
    'gross_recorded_payments_minor', _gross,
    'reversed_payments_minor', _rev,
    'valid_paid_minor', _valid,
    'refunded_minor', _ref,
    'net_paid_minor', _net,
    'outstanding_minor', greatest(coalesce(_total,0) - _net, 0),
    'overpaid_minor', greatest(_net - coalesce(_total,0), 0));
end; $$;

-- 17
create or replace function app_private.w09_assert_refund_allowed(
  _order_id uuid, _payment_id uuid, _amount bigint)
returns void language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _p public.financial_facts; _refunded bigint; _state jsonb;
begin
  select * into _p from public.financial_facts f where f.id = _payment_id;
  if _p.id is null or _p.fact_type <> 'PAYMENT_RECORDED' then
    raise exception 'A refund must reference a recorded payment';
  end if;
  if _p.order_id <> _order_id then
    raise exception 'The referenced payment belongs to a different order';
  end if;
  if exists (select 1 from public.financial_facts f
              where f.references_fact_id = _payment_id
                and f.fact_type = 'PAYMENT_REVERSED') then
    raise exception 'This payment was reversed and can no longer be refunded';
  end if;
  select coalesce(sum(f.amount_minor),0) into _refunded
    from public.financial_facts f
   where f.references_fact_id = _payment_id and f.fact_type = 'REFUND_RECORDED';
  if _refunded + _amount > _p.amount_minor then
    raise exception 'Refunds cannot exceed the referenced payment (payment %, already refunded %, requested %)',
      _p.amount_minor, _refunded, _amount;
  end if;
  _state := app_private.w09_order_financial_state(_order_id);
  if (_state->>'refunded_minor')::bigint + _amount > (_state->>'valid_paid_minor')::bigint then
    raise exception 'Refunds cannot exceed the valid paid amount of this order';
  end if;
end; $$;

-- 18
create or replace function app_private.w09_content_guard(_value text)
returns text language plpgsql immutable
set search_path to 'pg_catalog','public' as $$
declare _v text := nullif(btrim(coalesce(_value,'')),''); _digits text;
begin
  if _v is null then return null; end if;
  if char_length(_v) > 500 then
    raise exception 'This text is too long';
  end if;
  _digits := regexp_replace(_v, '[^0-9]', '', 'g');
  if char_length(_digits) between 13 and 19
     and _v ~ '(\d[ -]?){13,19}' then
    raise exception 'This value looks like a card number and cannot be stored';
  end if;
  if _v ~* '(cvv|cvc|senha|password|secret[_ ]?key|api[_ ]?key|private[_ ]?key|token)' then
    raise exception 'Credentials must never be stored in commerce records';
  end if;
  return _v;
end; $$;

-- ============================================== PRIVATE HELPER EXECUTE ACLs
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_private' and p.proname like 'w09\_%' loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('revoke all on function %s from authenticated', f.sig);
  end loop;
end $$;