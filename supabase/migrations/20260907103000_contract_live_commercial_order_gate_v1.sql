-- COBS OS · Contract live commercial order gate v1
-- Contractual readiness must not treat an expired unpaid public checkout as a contractable customer.
-- Preserves historical orders/reservations/payment evidence; only tightens the contract eligibility predicate.

create or replace function app_private.order_is_contractable_production(
  _tenant_id uuid,
  _order_id uuid
) returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','app_private'
as $$
  select coalesce(exists(
    select 1
    from public.orders o
    where o.tenant_id=_tenant_id
      and o.id=_order_id
      and o.status in ('submitted','confirmed')
      and o.grand_total_minor is not null
      and o.grand_total_minor>0
      and app_private.order_matches_commerce_environment(o.tenant_id,o.id,'production')
      and exists(
        select 1
        from public.commercial_reservations cr
        where cr.tenant_id=o.tenant_id
          and cr.order_id=o.id
          and cr.offering_id is not null
          and (
            cr.status='confirmed'
            or (cr.status='reserved' and cr.expires_at is not null and cr.expires_at>now())
          )
      )
      and (
        o.status='confirmed'
        or (
          select coalesce(sum(case
            when ff.fact_type='PAYMENT_RECORDED' then ff.amount_minor
            when ff.fact_type in ('PAYMENT_REVERSED','REFUND_RECORDED') then -ff.amount_minor
            else 0
          end),0)
          from public.financial_facts ff
          where ff.tenant_id=o.tenant_id
            and ff.order_id=o.id
        )>0
      )
  ),false);
$$;

revoke all on function app_private.order_is_contractable_production(uuid,uuid) from public;
comment on function app_private.order_is_contractable_production(uuid,uuid) is
  'Contract eligibility: production-classified order plus a live reservation and either confirmed order or positive net financial facts. Expired unpaid or fully reversed/refunded checkouts are excluded without mutating history.';

create or replace function app_private.guard_customer_contract_production_environment()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if new.template_key='CIOSP-2027'
     and not app_private.order_is_contractable_production(new.tenant_id,new.order_id) then
    raise exception 'production_contract_order_required';
  end if;
  return new;
end;
$$;

create or replace function public.get_operation_contract_parties(_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_op public.operations%rowtype;
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_op from public.operations where id=_operation_id;
  if not found then raise exception 'operation_not_found'; end if;
  if not app_private.has_tenant_role(v_op.tenant_id,array['owner','admin','operations_agent']::public.app_role[]) then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',o.id,'buyer_person_id',o.buyer_person_id,'buyer_name',p.full_name,
    'order_status',o.status,'reservation_status',r.status,
    'document_type',cpp.document_type,'document_number',cpp.document_number,
    'address_line1',cpp.address_line1,'address_line2',cpp.address_line2,'district',cpp.district,
    'city',cpp.city,'state_region',cpp.state_region,'postal_code',cpp.postal_code,'country_code',cpp.country_code,
    'contract_party_profile_complete',cpp.person_id is not null
      and nullif(btrim(coalesce(cpp.document_type,'')),'') is not null
      and nullif(btrim(coalesce(cpp.document_number,'')),'') is not null
      and nullif(btrim(coalesce(cpp.address_line1,'')),'') is not null
      and nullif(btrim(coalesce(cpp.city,'')),'') is not null
      and nullif(btrim(coalesce(cpp.state_region,'')),'') is not null
      and nullif(btrim(coalesce(cpp.postal_code,'')),'') is not null
      and nullif(btrim(coalesce(cpp.country_code,'')),'') is not null
  ) order by o.created_at desc),'[]'::jsonb)
  into v_rows
  from public.orders o
  join public.people p on p.id=o.buyer_person_id and p.tenant_id=o.tenant_id
  join lateral(
    select cr.status from public.commercial_reservations cr
    where cr.tenant_id=o.tenant_id and cr.order_id=o.id and cr.offering_id is not null
      and (cr.status='confirmed' or (cr.status='reserved' and cr.expires_at is not null and cr.expires_at>now()))
    order by cr.created_at desc limit 1
  ) r on true
  left join public.contract_party_profiles cpp on cpp.tenant_id=o.tenant_id and cpp.person_id=o.buyer_person_id
  where o.tenant_id=v_op.tenant_id and o.operation_id=v_op.id
    and o.buyer_person_id is not null
    and app_private.order_is_contractable_production(o.tenant_id,o.id);
  return v_rows;
end;
$$;

revoke all on function public.get_operation_contract_parties(uuid) from public,anon;
grant execute on function public.get_operation_contract_parties(uuid) to authenticated,service_role;

-- Patch the canonical readiness RPC by replacing its repeated contractable-order predicate through a view-like helper.
-- The next canonical readiness revision must use app_private.order_is_contractable_production directly.
