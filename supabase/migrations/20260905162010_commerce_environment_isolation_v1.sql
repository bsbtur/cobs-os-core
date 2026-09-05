-- Commerce order listing with explicit production/QA isolation.
-- Keeps the existing generic list_orders RPC intact for backwards compatibility.

create or replace function public.list_orders_by_environment(
  _tenant_id uuid,
  _environment text default 'production',
  _status public.order_status default null,
  _operation_id uuid default null,
  _limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  _out jsonb;
begin
  perform app_private.w09_require_commerce_read(_tenant_id);

  if _environment not in ('production', 'qa') then
    raise exception 'Invalid commerce environment';
  end if;

  with classified_orders as (
    select
      o.*,
      (
        coalesce((o.metadata->>'qa_public_checkout')::boolean, false)
        or lower(coalesce(o.metadata->>'qa_environment', '')) in ('qa', 'test')
        or lower(coalesce(o.metadata->>'qa_payment_environment', '')) in ('qa', 'test')
        or exists (
          select 1
          from public.payment_charges pc
          where pc.tenant_id = _tenant_id
            and pc.order_id = o.id
            and pc.metadata->>'environment' = 'test'
        )
        or coalesce(op.code, '') ~* '(^|[^[:alnum:]])QA([^[:alnum:]]|$)'
        or coalesce(o.reference_label, '') ~* '(^|[^[:alnum:]])QA([^[:alnum:]]|$)'
      ) as is_qa,
      exists (
        select 1
        from public.payment_charges pc
        where pc.tenant_id = _tenant_id
          and pc.order_id = o.id
          and pc.metadata->>'environment' = 'production'
      ) as has_production_charge
    from public.orders o
    left join public.operations op
      on op.id = o.operation_id
     and op.tenant_id = o.tenant_id
    where o.tenant_id = _tenant_id
      and (_status is null or o.status = _status)
      and (_operation_id is null or o.operation_id = _operation_id)
  ), scoped_orders as (
    select o.*
    from classified_orders o
    where case
      when _environment = 'qa' then o.is_qa
      else
        not o.is_qa
        and (
          coalesce(o.metadata->>'source', '') <> 'public_checkout'
          or o.has_production_charge
        )
    end
    order by o.created_at desc
    limit greatest(1, least(coalesce(_limit, 100), 500))
  )
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
  into _out
  from (
    select jsonb_build_object(
      'id', o.id,
      'status', o.status,
      'currency', o.currency,
      'buyer_person_id', o.buyer_person_id,
      'buyer_name', o.buyer_name_snapshot,
      'operation_id', o.operation_id,
      'reference_label', o.reference_label,
      'grand_total_minor', coalesce(
        o.grand_total_minor,
        (app_private.w09_compute_order_totals(o.id)->>'grand_total_minor')::bigint
      ),
      'item_count', (
        select count(*) from public.order_items i where i.order_id = o.id
      ),
      'financial', app_private.w09_order_financial_state(o.id),
      'environment', _environment,
      'created_at', o.created_at
    ) as x
    from scoped_orders o
  ) rows;

  return _out;
end;
$$;

revoke all on function public.list_orders_by_environment(
  uuid, text, public.order_status, uuid, integer
) from public, anon;
grant execute on function public.list_orders_by_environment(
  uuid, text, public.order_status, uuid, integer
) to authenticated;
