-- COBS OS · Operation contract workflow read v1
-- Production-only, read-only projection of contractable orders and their contract document state.
-- No contract generation, rendering, legal activation, provider call or payment mutation occurs here.

create or replace function public.get_operation_contract_workflow(
  _operation_id uuid,
  _template_key text default 'CIOSP-2027'
) returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_operation public.operations%rowtype;
  v_template_key text := nullif(btrim(coalesce(_template_key,'')),'');
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_template_key is null then raise exception 'template_key_required'; end if;

  select * into v_operation from public.operations where id=_operation_id;
  if not found then raise exception 'operation_not_found'; end if;
  if not app_private.has_tenant_role(
    v_operation.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',o.id,
    'buyer_person_id',o.buyer_person_id,
    'buyer_name',p.full_name,
    'order_status',o.status,
    'reservation_status',r.status,
    'party_profile_complete',
      cpp.person_id is not null
      and nullif(btrim(coalesce(cpp.document_number,'')),'') is not null
      and nullif(btrim(coalesce(cpp.address_line1,'')),'') is not null
      and nullif(btrim(coalesce(cpp.city,'')),'') is not null
      and nullif(btrim(coalesce(cpp.state_region,'')),'') is not null
      and nullif(btrim(coalesce(cpp.postal_code,'')),'') is not null,
    'contract_id',cc.id,
    'contract_status',cc.status,
    'template_version',cc.template_version,
    'ready_for_render',coalesce((cc.metadata->>'ready_for_render')::boolean,false),
    'document_rendered',cc.original_document_path is not null and cc.document_hash is not null,
    'document_hash',cc.document_hash,
    'provider_envelope_present',cc.provider_envelope_id is not null,
    'provider_send_exposed',false
  ) order by o.created_at desc),'[]'::jsonb)
  into v_rows
  from public.orders o
  join public.people p
    on p.id=o.buyer_person_id and p.tenant_id=o.tenant_id
  join lateral (
    select cr.status
    from public.commercial_reservations cr
    where cr.tenant_id=o.tenant_id
      and cr.order_id=o.id
      and cr.status in ('reserved','confirmed')
      and cr.offering_id is not null
    order by cr.created_at desc
    limit 1
  ) r on true
  left join public.contract_party_profiles cpp
    on cpp.tenant_id=o.tenant_id and cpp.person_id=o.buyer_person_id
  left join lateral (
    select c.id,c.status,c.template_version,c.original_document_path,c.document_hash,
           c.provider_envelope_id,c.metadata
    from public.customer_contracts c
    where c.tenant_id=o.tenant_id
      and c.order_id=o.id
      and c.template_key=v_template_key
      and c.status in ('draft','sent','viewed','signed')
    order by c.created_at desc
    limit 1
  ) cc on true
  where o.tenant_id=v_operation.tenant_id
    and o.operation_id=v_operation.id
    and o.status in ('submitted','confirmed')
    and o.buyer_person_id is not null
    and o.grand_total_minor is not null
    and o.grand_total_minor>0
    and app_private.order_matches_commerce_environment(o.tenant_id,o.id,'production');

  return v_rows;
end;
$$;

revoke all on function public.get_operation_contract_workflow(uuid,text) from public,anon;
grant execute on function public.get_operation_contract_workflow(uuid,text) to authenticated,service_role;

comment on function public.get_operation_contract_workflow(uuid,text) is
  'Read-only production-only contract workflow projection. Provider send is intentionally never exposed.';
