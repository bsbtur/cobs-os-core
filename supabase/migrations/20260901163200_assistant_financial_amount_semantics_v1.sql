create or replace function app_private.assistant_build_payment_context(_tenant_id uuid, _operation_id uuid, _profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  _person_id uuid; _order_id uuid; _currency text; _order_total bigint; _paid_total bigint := 0; _refunded_total bigint := 0; _net_paid bigint := 0; _balance bigint := 0; _charges jsonb := '[]'::jsonb;
begin
  if not app_private.assistant_has_operation_access(_tenant_id,_operation_id,_profile_id) then raise exception 'operation_access_denied'; end if;
  select g.person_id into _person_id from public.participant_access_grants g where g.tenant_id=_tenant_id and g.operation_id=_operation_id and g.profile_id=_profile_id and g.status::text='active' and g.revoked_at is null order by g.activated_at desc nulls last,g.granted_at desc limit 1;
  if _person_id is null then return '{}'::jsonb; end if;
  select o.id,o.currency,o.grand_total_minor into _order_id,_currency,_order_total from public.commercial_reservations r join public.orders o on o.id=r.order_id and o.tenant_id=r.tenant_id join public.order_items oi on oi.id=r.order_item_id and oi.order_id=r.order_id and oi.tenant_id=r.tenant_id where r.tenant_id=_tenant_id and o.operation_id=_operation_id and oi.beneficiary_person_id=_person_id and r.status::text in ('confirmed','reserved') and o.status::text<>'cancelled' order by case r.status::text when 'confirmed' then 0 else 1 end,r.confirmed_at desc nulls last,r.created_at desc limit 1;
  if _order_id is null then return '{}'::jsonb; end if;
  select coalesce(sum(pc.paid_amount_minor),0),coalesce(sum(pc.refunded_amount_minor),0),coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('status',pc.status::text,'amount',round(pc.amount_minor::numeric/100,2),'paid_amount',round(pc.paid_amount_minor::numeric/100,2),'refunded_amount',round(pc.refunded_amount_minor::numeric/100,2),'installment_number',pc.installment_number,'installment_count',pc.installment_count,'due_date',case when pc.due_at is not null then (pc.due_at at time zone coalesce((select timezone from public.operations where id=_operation_id and tenant_id=_tenant_id),'UTC'))::date else null end,'paid_date',case when pc.paid_at is not null then (pc.paid_at at time zone coalesce((select timezone from public.operations where id=_operation_id and tenant_id=_tenant_id),'UTC'))::date else null end)) order by pc.installment_number nulls last,pc.created_at),'[]'::jsonb) into _paid_total,_refunded_total,_charges from public.payment_charges pc where pc.tenant_id=_tenant_id and pc.order_id=_order_id and pc.status::text<>'cancelled';
  _net_paid:=greatest(_paid_total-_refunded_total,0); _balance:=greatest(coalesce(_order_total,0)-_net_paid,0);
  return jsonb_build_object('currency',_currency,'amount_unit','major','amount_semantics','All monetary amount fields are expressed in major currency units. For BRL, 2490.00 means R$ 2.490,00. Do not divide or multiply these values.','order_total',round(coalesce(_order_total,0)::numeric/100,2),'paid_total',round(_paid_total::numeric/100,2),'refunded_total',round(_refunded_total::numeric/100,2),'net_paid',round(_net_paid::numeric/100,2),'balance_due',round(_balance::numeric/100,2),'payment_status',case when _balance=0 and coalesce(_order_total,0)>0 then 'paid' when _net_paid>0 then 'partially_paid' when jsonb_array_length(_charges)>0 then 'pending' else 'no_charge' end,'charges',_charges);
end;
$$;
revoke all on function app_private.assistant_build_payment_context(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function app_private.assistant_build_payment_context(uuid,uuid,uuid) to postgres;
