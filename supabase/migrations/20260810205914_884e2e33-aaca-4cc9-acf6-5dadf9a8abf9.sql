-- ===================================================================
-- COBS OS · W09 — PUBLIC READ FUNCTIONS (6)
-- ===================================================================

-- 1 ------------------------------------------------ get_commerce_catalog
create or replace function public.get_commerce_catalog(_tenant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _out jsonb;
begin
  perform app_private.w09_require_commerce_read(_tenant_id);
  select coalesce(jsonb_agg(x order by x->>'label'), '[]'::jsonb) into _out
  from (
    select jsonb_build_object(
      'id', s.id,
      'sellable_kind', s.sellable_kind,
      'status', s.status,
      'offering_id', s.offering_id,
      'label', coalesce(s.name, o.name, '—'),
      'description', s.description,
      'offering_status', o.status,
      'offering_capacity', o.capacity,
      'prices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'currency', p.currency,
          'unit_amount_minor', p.unit_amount_minor,
          'price_basis', p.price_basis, 'status', p.status,
          'description', p.description,
          'valid_from', p.valid_from, 'valid_until', p.valid_until,
          'is_current', (p.status = 'active' and p.valid_from <= now()
                         and (p.valid_until is null or p.valid_until > now())))
          order by p.currency, p.valid_from desc)
        from public.prices p where p.sellable_id = s.id), '[]'::jsonb)
    ) as x
    from public.sellables s
    left join public.offerings o on o.id = s.offering_id
    where s.tenant_id = _tenant_id
  ) t;
  return _out;
end; $$;

-- 2 --------------------------------------------------- get_order_detail
create or replace function public.get_order_detail(_order_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _o public.orders; _items jsonb; _res jsonb; _facts jsonb;
begin
  select * into _o from public.orders o where o.id = _order_id;
  if _o.id is null then raise exception 'Order not found'; end if;
  perform app_private.w09_require_commerce_read(_o.tenant_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'sellable_id', i.sellable_id, 'price_id', i.price_id,
    'offering_id', i.offering_id, 'sellable_kind', i.sellable_kind,
    'name', i.sellable_name_snapshot, 'description', i.description_snapshot,
    'price_basis', i.price_basis, 'currency', i.currency,
    'unit_amount_minor', i.unit_amount_minor, 'quantity', i.quantity,
    'discount_minor', i.discount_minor,
    'line_subtotal_minor', i.line_subtotal_minor,
    'line_total_minor', i.line_total_minor,
    'beneficiary_person_id', i.beneficiary_person_id,
    'beneficiary_name', bp.full_name,
    'snapshot_taken_at', i.snapshot_taken_at) order by i.created_at), '[]'::jsonb)
    into _items
    from public.order_items i
    left join public.people bp on bp.id = i.beneficiary_person_id
   where i.order_id = _order_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'order_item_id', r.order_item_id, 'offering_id', r.offering_id,
    'quantity', r.quantity, 'status', r.status,
    'effective_state', case when r.status = 'reserved' and r.expires_at <= now()
                            then 'expired' else r.status::text end,
    'consumes_capacity', (r.status = 'confirmed'
                          or (r.status = 'reserved' and r.expires_at > now())),
    'expires_at', r.expires_at, 'confirmed_at', r.confirmed_at,
    'released_at', r.released_at, 'released_reason', r.released_reason,
    'expired_at', r.expired_at,
    'reacquired_from_reservation_id', r.reacquired_from_reservation_id)
    order by r.created_at), '[]'::jsonb)
    into _res
    from public.commercial_reservations r where r.order_id = _order_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'fact_type', f.fact_type, 'amount_minor', f.amount_minor,
    'currency', f.currency, 'method', f.method, 'reference', f.reference,
    'reason', f.reason, 'references_fact_id', f.references_fact_id,
    'occurred_at', f.occurred_at, 'recorded_at', f.recorded_at,
    'is_reversed', exists (select 1 from public.financial_facts g
                            where g.references_fact_id = f.id
                              and g.fact_type = 'PAYMENT_REVERSED'),
    'refunded_minor', coalesce((select sum(g.amount_minor) from public.financial_facts g
                                 where g.references_fact_id = f.id
                                   and g.fact_type = 'REFUND_RECORDED'), 0))
    order by f.occurred_at, f.created_at), '[]'::jsonb)
    into _facts
    from public.financial_facts f where f.order_id = _order_id;

  return jsonb_build_object(
    'order', jsonb_build_object(
      'id', _o.id, 'tenant_id', _o.tenant_id, 'operation_id', _o.operation_id,
      'buyer_person_id', _o.buyer_person_id, 'buyer_name', _o.buyer_name_snapshot,
      'currency', _o.currency, 'status', _o.status,
      'reference_label', _o.reference_label, 'notes', _o.notes,
      'subtotal_minor', _o.subtotal_minor,
      'discount_total_minor', _o.discount_total_minor,
      'grand_total_minor', _o.grand_total_minor,
      'submitted_at', _o.submitted_at, 'confirmed_at', _o.confirmed_at,
      'cancelled_at', _o.cancelled_at, 'cancellation_reason', _o.cancellation_reason,
      'completed_at', _o.completed_at, 'created_at', _o.created_at),
    'items', _items,
    'reservations', _res,
    'facts', _facts,
    'financial', app_private.w09_order_financial_state(_order_id),
    'draft_totals', case when _o.status = 'draft'
                         then app_private.w09_compute_order_totals(_order_id) else null end);
end; $$;

-- 3 -------------------------------------------------------- list_orders
create or replace function public.list_orders(
  _tenant_id uuid,
  _status public.order_status default null,
  _operation_id uuid default null,
  _limit integer default 100)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _out jsonb;
begin
  perform app_private.w09_require_commerce_read(_tenant_id);
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into _out
  from (
    select jsonb_build_object(
      'id', o.id, 'status', o.status, 'currency', o.currency,
      'buyer_person_id', o.buyer_person_id, 'buyer_name', o.buyer_name_snapshot,
      'operation_id', o.operation_id,
      'reference_label', o.reference_label,
      'grand_total_minor', coalesce(o.grand_total_minor,
        (app_private.w09_compute_order_totals(o.id)->>'grand_total_minor')::bigint),
      'item_count', (select count(*) from public.order_items i where i.order_id = o.id),
      'financial', app_private.w09_order_financial_state(o.id),
      'created_at', o.created_at) as x
    from public.orders o
    where o.tenant_id = _tenant_id
      and (_status is null or o.status = _status)
      and (_operation_id is null or o.operation_id = _operation_id)
    order by o.created_at desc
    limit greatest(1, least(coalesce(_limit,100), 500))
  ) t;
  return _out;
end; $$;

-- 4 ------------------------------------------- get_order_financial_state
create or replace function public.get_order_financial_state(_order_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _tenant uuid;
begin
  select o.tenant_id into _tenant from public.orders o where o.id = _order_id;
  if _tenant is null then raise exception 'Order not found'; end if;
  perform app_private.w09_require_commerce_read(_tenant);
  return app_private.w09_order_financial_state(_order_id);
end; $$;

-- 5 ------------------------------ get_offering_commercial_availability
create or replace function public.get_offering_commercial_availability(_offering_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _o public.offerings; _used bigint; _reserved bigint; _confirmed bigint;
begin
  select * into _o from public.offerings o where o.id = _offering_id;
  if _o.id is null then raise exception 'Offering not found'; end if;
  perform app_private.w09_require_commerce_read(_o.tenant_id);

  select coalesce(sum(r.quantity) filter (
           where r.status = 'reserved' and r.expires_at > now()), 0),
         coalesce(sum(r.quantity) filter (where r.status = 'confirmed'), 0)
    into _reserved, _confirmed
    from public.commercial_reservations r where r.offering_id = _offering_id;
  _used := _reserved + _confirmed;

  return jsonb_build_object(
    'offering_id', _o.id,
    'capacity', _o.capacity,
    'effective_reserved', _reserved,
    'effective_confirmed', _confirmed,
    'effective_occupancy', _used,
    'remaining', case when _o.capacity is null then null else _o.capacity - _used end,
    'sales_end', _o.sales_end,
    'sellable', (_o.status = 'active'
                 and (_o.sales_start is null or _o.sales_start <= now())
                 and (_o.sales_end is null or _o.sales_end > now())
                 and (_o.capacity is null or _o.capacity - _used > 0)));
end; $$;

-- 6 --------------------------------- get_operation_commerce_summary
create or replace function public.get_operation_commerce_summary(_operation_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public' as $$
declare _tenant uuid; _cur char(3); _rows jsonb;
        _total bigint := 0; _net bigint := 0; _out bigint := 0; _over bigint := 0;
        _r record;
begin
  select o.tenant_id into _tenant from public.operations o where o.id = _operation_id;
  if _tenant is null then raise exception 'Operation not found'; end if;
  perform app_private.w09_require_commerce_read(_tenant);

  for _r in
    select o.id, o.currency, coalesce(o.grand_total_minor,0) as total, o.status
      from public.orders o
     where o.operation_id = _operation_id and o.status <> 'cancelled'
  loop
    _cur := coalesce(_cur, _r.currency);
    _total := _total + _r.total;
    _net := _net + (app_private.w09_order_financial_state(_r.id)->>'net_paid_minor')::bigint;
  end loop;
  _out := greatest(_total - _net, 0);
  _over := greatest(_net - _total, 0);

  select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) into _rows
    from (select o.status::text as status, count(*) as n
            from public.orders o where o.operation_id = _operation_id
           group by o.status) s;

  return jsonb_build_object(
    'operation_id', _operation_id,
    'currency', _cur,
    'counts_by_status', _rows,
    'grand_total_minor', _total,
    'net_paid_minor', _net,
    'outstanding_minor', _out,
    'overpaid_minor', _over);
end; $$;

-- ================================================================= ACLs
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('get_commerce_catalog','get_order_detail','list_orders',
                'get_order_financial_state','get_offering_commercial_availability',
                'get_operation_commerce_summary') loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;