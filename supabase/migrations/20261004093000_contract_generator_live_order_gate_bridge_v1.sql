-- COBS OS · Contract generator live-order gate bridge v1
-- Service-role-only bridge for the contracts-generate Edge Function.
-- Keeps the canonical eligibility predicate private from browser/authenticated callers.

create or replace function public.is_order_contractable_production_for_service(
  _tenant_id uuid,
  _order_id uuid
) returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','app_private'
as $$
  select app_private.order_is_contractable_production(_tenant_id,_order_id);
$$;

revoke all on function public.is_order_contractable_production_for_service(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.is_order_contractable_production_for_service(uuid,uuid)
  to service_role;

comment on function public.is_order_contractable_production_for_service(uuid,uuid) is
  'Service-role-only bridge used by contracts-generate to enforce the canonical production contract eligibility predicate before snapshot or insert.';
