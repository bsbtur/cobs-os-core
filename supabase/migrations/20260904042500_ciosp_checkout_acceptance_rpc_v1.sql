create or replace function public.ciosp_persist_checkout_acceptance_v1(
  _order_id uuid,
  _commercial_acceptance jsonb,
  _qa_mode_source text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _order public.orders;
  _reservation public.commercial_reservations;
  _meta jsonb;
begin
  if _order_id is null then raise exception 'order_id is required'; end if;
  if _commercial_acceptance is null or jsonb_typeof(_commercial_acceptance) <> 'object' then
    raise exception 'commercial_acceptance is required';
  end if;

  select * into _order from public.orders where id = _order_id;
  if _order.id is null then raise exception 'order not found'; end if;
  if coalesce(_order.metadata->>'source','') <> 'public_checkout' then
    raise exception 'order is not a public checkout';
  end if;

  _meta := coalesce(_order.metadata,'{}'::jsonb)
    || jsonb_build_object('commercial_acceptance', _commercial_acceptance);

  if nullif(btrim(coalesce(_qa_mode_source,'')),'') is not null then
    _meta := _meta || jsonb_build_object(
      'qa_public_checkout', true,
      'qa_mode_source', btrim(_qa_mode_source),
      'qa_payment_environment', 'test'
    );
  end if;

  perform set_config('app.w09_control','on',true);
  update public.orders set metadata = _meta where id = _order.id;

  select * into _reservation
  from public.commercial_reservations
  where order_id = _order.id and tenant_id = _order.tenant_id
  order by created_at asc
  limit 1;

  if _reservation.id is not null then
    update public.commercial_reservations
       set metadata = coalesce(metadata,'{}'::jsonb)
         || jsonb_build_object('commercial_acceptance', _commercial_acceptance)
         || case when nullif(btrim(coalesce(_qa_mode_source,'')),'') is not null
              then jsonb_build_object('qa_public_checkout',true,'qa_payment_environment','test')
              else '{}'::jsonb
            end
     where id = _reservation.id;
  end if;
  perform set_config('app.w09_control','off',true);

  return jsonb_build_object(
    'order_id', _order.id,
    'reservation_id', _reservation.id,
    'persisted', true
  );
end;
$function$;

revoke all on function public.ciosp_persist_checkout_acceptance_v1(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.ciosp_persist_checkout_acceptance_v1(uuid,jsonb,text) to service_role;