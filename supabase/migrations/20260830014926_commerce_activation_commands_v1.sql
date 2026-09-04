create or replace function public.activate_offering(_offering_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _row public.offerings;
begin
  select * into _row from public.offerings where id=_offering_id for update;
  if _row.id is null then raise exception 'Offering not found'; end if;
  perform app_private.w09_require_commerce_manager(_row.tenant_id);
  if _row.status='active' then return _offering_id; end if;
  if _row.status='archived' then raise exception 'Archived offering cannot be activated'; end if;
  update public.offerings set status='active' where id=_offering_id;
  return _offering_id;
end;
$function$;

create or replace function public.activate_sellable(_sellable_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _row public.sellables; _offering_status public.offering_status;
begin
  select * into _row from public.sellables where id=_sellable_id for update;
  if _row.id is null then raise exception 'Sellable not found'; end if;
  perform app_private.w09_require_commerce_manager(_row.tenant_id);
  if _row.status='active' then return _sellable_id; end if;
  if _row.offering_id is not null then
    select status into _offering_status from public.offerings where id=_row.offering_id;
    if _offering_status is distinct from 'active' then raise exception 'Offering must be active before sellable activation'; end if;
  end if;
  perform set_config('app.w09_control','on',true);
  update public.sellables set status='active' where id=_sellable_id;
  perform set_config('app.w09_control','off',true);
  perform app_private.record_audit_event(_row.tenant_id,auth.uid(),'commerce.sellable_activated','sellable',_sellable_id,null,'{}'::jsonb);
  return _sellable_id;
end;
$function$;

create or replace function public.activate_price(_price_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _row public.prices; _sellable_status public.sellable_status;
begin
  select * into _row from public.prices where id=_price_id for update;
  if _row.id is null then raise exception 'Price not found'; end if;
  perform app_private.w09_require_commerce_manager(_row.tenant_id);
  if _row.status='active' then return _price_id; end if;
  select status into _sellable_status from public.sellables where id=_row.sellable_id;
  if _sellable_status is distinct from 'active' then raise exception 'Sellable must be active before price activation'; end if;
  perform set_config('app.w09_control','on',true);
  update public.prices set status='active' where id=_price_id;
  perform set_config('app.w09_control','off',true);
  perform app_private.record_audit_event(_row.tenant_id,auth.uid(),'commerce.price_activated','price',_price_id,null,jsonb_build_object('amount_minor',_row.unit_amount_minor,'currency',_row.currency));
  return _price_id;
end;
$function$;

revoke all on function public.activate_offering(uuid) from public;
revoke all on function public.activate_sellable(uuid) from public;
revoke all on function public.activate_price(uuid) from public;
grant execute on function public.activate_offering(uuid) to authenticated;
grant execute on function public.activate_sellable(uuid) to authenticated;
grant execute on function public.activate_price(uuid) to authenticated;