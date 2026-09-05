-- CIOSP 2027 commercial dashboard: canonical, tenant-authorized read model.
-- Production and QA are deliberately mutually exclusive.

create or replace function public.get_ciosp_commercial_dashboard(
  _tenant_id uuid,
  _environment text default 'production'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  _operation public.operations;
  _offering public.offerings;
  _orders jsonb;
  _confirmed integer := 0;
  _reserved integer := 0;
  _received bigint := 0;
  _outstanding bigint := 0;
  _awaiting_pix integer := 0;
begin
  perform app_private.w09_require_commerce_read(_tenant_id);

  if _environment not in ('production', 'qa') then
    raise exception 'Invalid dashboard environment';
  end if;

  select op.* into _operation
    from public.operations op
   where op.tenant_id = _tenant_id
     and op.code = 'CIOSP-SP-2027'
     and op.archived_at is null
   order by op.created_at desc
   limit 1;

  if _operation.id is null or _operation.offering_id is null then
    raise exception 'Canonical CIOSP 2027 operation not found';
  end if;

  select off.* into _offering
    from public.offerings off
   where off.id = _operation.offering_id
     and off.tenant_id = _tenant_id;

  if _offering.id is null then
    raise exception 'Canonical CIOSP 2027 offering not found';
  end if;

  with scoped_orders as (
    select o.*,
           coalesce((o.metadata->>'qa_public_checkout')::boolean, false) as is_qa
      from public.orders o
     where o.tenant_id = _tenant_id
       and o.operation_id = _operation.id
       and o.status <> 'cancelled'
       and case when _environment = 'qa' then
             coalesce((o.metadata->>'qa_public_checkout')::boolean, false)
             or exists (
               select 1 from public.payment_charges pc
                where pc.order_id = o.id and pc.metadata->>'environment' = 'test'
             )
           else
             not coalesce((o.metadata->>'qa_public_checkout')::boolean, false)
             and not exists (
               select 1 from public.payment_charges pc
                where pc.order_id = o.id and pc.metadata->>'environment' = 'test'
             )
             and exists (
               select 1 from public.payment_charges pc
                where pc.order_id = o.id and pc.metadata->>'environment' = 'production'
             )
           end
  ), reservation_totals as (
    select r.order_id,
           coalesce(sum(r.quantity) filter (where r.status = 'confirmed'), 0)::integer as confirmed,
           coalesce(sum(r.quantity) filter (
             where r.status = 'reserved' and r.expires_at > now()
           ), 0)::integer as reserved
      from public.commercial_reservations r
      join scoped_orders o on o.id = r.order_id
     where r.tenant_id = _tenant_id
       and r.offering_id = _offering.id
     group by r.order_id
  ), financial_totals as (
    select f.order_id,
           greatest(coalesce(sum(case
             when f.fact_type = 'PAYMENT_RECORDED' then f.amount_minor
             when f.fact_type in ('PAYMENT_REVERSED', 'REFUND_RECORDED') then -f.amount_minor
             else 0
           end), 0), 0)::bigint as net_paid
      from public.financial_facts f
      join scoped_orders o on o.id = f.order_id
     where f.tenant_id = _tenant_id
     group by f.order_id
  ), order_rows as (
    select o.*,
           coalesce(rt.confirmed, 0) as confirmed_seats,
           coalesce(rt.reserved, 0) as reserved_seats,
           coalesce(ft.net_paid, 0) as net_paid,
           greatest(coalesce(o.grand_total_minor, 0) - coalesce(ft.net_paid, 0), 0) as balance,
           exists (
             select 1 from public.payment_charges pc
              where pc.tenant_id = _tenant_id
                and pc.order_id = o.id
                and pc.status in ('draft', 'pending', 'processing')
           ) as awaiting_pix
      from scoped_orders o
      left join reservation_totals rt on rt.order_id = o.id
      left join financial_totals ft on ft.order_id = o.id
  )
  select coalesce(sum(confirmed_seats), 0)::integer,
         coalesce(sum(reserved_seats), 0)::integer,
         coalesce(sum(net_paid) filter (where status in ('confirmed', 'completed')), 0)::bigint,
         coalesce(sum(balance) filter (where status in ('confirmed', 'completed')), 0)::bigint,
         count(*) filter (where awaiting_pix and status = 'submitted')::integer
    into _confirmed, _reserved, _received, _outstanding, _awaiting_pix
    from order_rows;

  with scoped_orders as (
    select o.*
      from public.orders o
     where o.tenant_id = _tenant_id
       and o.operation_id = _operation.id
       and o.status <> 'cancelled'
       and case when _environment = 'qa' then
             coalesce((o.metadata->>'qa_public_checkout')::boolean, false)
             or exists (
               select 1 from public.payment_charges pc
                where pc.order_id = o.id and pc.metadata->>'environment' = 'test'
             )
           else
             not coalesce((o.metadata->>'qa_public_checkout')::boolean, false)
             and not exists (
               select 1 from public.payment_charges pc
                where pc.order_id = o.id and pc.metadata->>'environment' = 'test'
             )
             and exists (
               select 1 from public.payment_charges pc
                where pc.order_id = o.id and pc.metadata->>'environment' = 'production'
             )
           end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id,
           'status', o.status,
           'buyer_name', coalesce(o.buyer_name_snapshot, buyer.full_name),
           'buyer_person_id', o.buyer_person_id,
           'participants', coalesce((
             select jsonb_agg(distinct jsonb_build_object(
               'id', beneficiary.id,
               'name', beneficiary.full_name
             ))
               from public.order_items oi
               left join public.people beneficiary on beneficiary.id = oi.beneficiary_person_id
              where oi.order_id = o.id
                and beneficiary.id is not null
           ), '[]'::jsonb),
           'grand_total_minor', coalesce(o.grand_total_minor, 0),
           'received_minor', coalesce((
             select greatest(sum(case
               when f.fact_type = 'PAYMENT_RECORDED' then f.amount_minor
               when f.fact_type in ('PAYMENT_REVERSED', 'REFUND_RECORDED') then -f.amount_minor
               else 0
             end), 0)
               from public.financial_facts f
              where f.order_id = o.id
           ), 0),
           'confirmed_seats', coalesce((
             select sum(r.quantity) from public.commercial_reservations r
              where r.order_id = o.id and r.status = 'confirmed'
           ), 0),
           'reserved_seats', coalesce((
             select sum(r.quantity) from public.commercial_reservations r
              where r.order_id = o.id and r.status = 'reserved' and r.expires_at > now()
           ), 0),
           'awaiting_pix', exists (
             select 1 from public.payment_charges pc
              where pc.order_id = o.id and pc.status in ('draft', 'pending', 'processing')
           ),
           'payment_schedule', coalesce(_offering.metadata->'payment_schedule_v1', '[]'::jsonb),
           'created_at', o.created_at
         ) order by o.created_at desc), '[]'::jsonb)
    into _orders
    from scoped_orders o
    left join public.people buyer on buyer.id = o.buyer_person_id;

  return jsonb_build_object(
    'environment', _environment,
    'operation_id', _operation.id,
    'offering_id', _offering.id,
    'offering_name', _offering.name,
    'currency', coalesce(_offering.currency_code, 'BRL'),
    'capacity', coalesce(_offering.capacity,
      (_offering.metadata->>'max_paying_passengers')::integer),
    'confirmed_seats', _confirmed,
    'reserved_seats', _reserved,
    'available_seats', greatest(coalesce(_offering.capacity,
      (_offering.metadata->>'max_paying_passengers')::integer, 0) - _confirmed - _reserved, 0),
    'received_minor', _received,
    'outstanding_minor', _outstanding,
    'awaiting_pix_orders', _awaiting_pix,
    'orders', _orders,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_ciosp_commercial_dashboard(uuid, text) from public, anon;
grant execute on function public.get_ciosp_commercial_dashboard(uuid, text) to authenticated;
