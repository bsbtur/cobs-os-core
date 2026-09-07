-- COBS OS · Contract readiness contractable orders v3
-- A contractable order must have a live commercial reservation.
-- Read-only correction: abandoned/orphan submitted orders no longer block operation readiness.

create or replace function public.get_operation_contract_readiness(
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
  v_template record;
  v_privacy_key text;
  v_privacy record;
  v_supplier_total integer := 0;
  v_supplier_ready integer := 0;
  v_journey_count integer := 0;
  v_order_count integer := 0;
  v_party_ready_count integer := 0;
  v_terms_ready_count integer := 0;
  v_payment_ready_count integer := 0;
  v_technical_ready boolean := false;
  v_legal_ready boolean := false;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_template_key is null then raise exception 'template_key_required'; end if;

  select * into v_operation from public.operations where id=_operation_id;
  if not found then raise exception 'operation_not_found'; end if;

  if not app_private.has_tenant_role(
    v_operation.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then
    raise exception 'forbidden';
  end if;

  select ct.id,ct.version,ct.status,ct.legal_reviewed_at,ct.metadata
  into v_template
  from public.contract_templates ct
  where ct.tenant_id=v_operation.tenant_id and ct.template_key=v_template_key
  order by case when ct.version='V3.1' then 0 else 1 end, ct.created_at desc
  limit 1;

  if v_template.id is not null then
    v_privacy_key := nullif(btrim(coalesce(v_template.metadata->>'privacy_policy_key','')),'');
  end if;

  if v_privacy_key is not null then
    select p.id,p.version,p.status,p.effective_at,p.content_hash,p.legal_reviewed_at,p.legal_review_reference
    into v_privacy
    from public.privacy_policy_versions p
    where p.tenant_id=v_operation.tenant_id
      and p.policy_key=v_privacy_key
      and p.status='active'
      and p.effective_at<=now()
    order by p.effective_at desc
    limit 1;
  end if;

  select count(*)::integer into v_journey_count
  from public.journey_steps js
  where js.tenant_id=v_operation.tenant_id
    and js.operation_id=v_operation.id
    and js.traveler_facing=true
    and js.archived_at is null;

  select count(*)::integer,
         count(*) filter (
           where nullif(btrim(coalesce(s.legal_name,s.name,'')),'') is not null
             and nullif(btrim(coalesce(s.document_number,'')),'') is not null
             and nullif(btrim(coalesce(s.address_line1,'')),'') is not null
             and nullif(btrim(coalesce(s.city,'')),'') is not null
             and nullif(btrim(coalesce(s.state_region,'')),'') is not null
             and nullif(btrim(coalesce(s.postal_code,'')),'') is not null
             and nullif(btrim(coalesce(s.country_code,'')),'') is not null
             and nullif(btrim(coalesce(q.contract_reference,'')),'') is not null
         )::integer
  into v_supplier_total,v_supplier_ready
  from public.operation_quotes q
  join public.suppliers s on s.id=q.supplier_id and s.tenant_id=q.tenant_id
  where q.tenant_id=v_operation.tenant_id
    and q.operation_id=v_operation.id
    and q.status='contracted';

  with contractable_orders as (
    select o.id,o.tenant_id,o.buyer_person_id,o.grand_total_minor
    from public.orders o
    where o.tenant_id=v_operation.tenant_id
      and o.operation_id=v_operation.id
      and o.status in ('submitted','confirmed')
      and o.grand_total_minor is not null
      and o.grand_total_minor>0
      and exists (
        select 1
        from public.commercial_reservations cr
        where cr.tenant_id=o.tenant_id
          and cr.order_id=o.id
          and cr.status in ('reserved','confirmed')
          and cr.offering_id is not null
      )
  )
  select count(*)::integer,
         count(*) filter (
           where cpp.person_id is not null
             and nullif(btrim(coalesce(cpp.document_number,'')),'') is not null
             and nullif(btrim(coalesce(cpp.address_line1,'')),'') is not null
             and nullif(btrim(coalesce(cpp.city,'')),'') is not null
             and nullif(btrim(coalesce(cpp.state_region,'')),'') is not null
             and nullif(btrim(coalesce(cpp.postal_code,'')),'') is not null
         )::integer
  into v_order_count,v_party_ready_count
  from contractable_orders co
  left join public.contract_party_profiles cpp
    on cpp.tenant_id=co.tenant_id and cpp.person_id=co.buyer_person_id;

  with contractable_orders as (
    select o.id,o.tenant_id,o.grand_total_minor
    from public.orders o
    where o.tenant_id=v_operation.tenant_id
      and o.operation_id=v_operation.id
      and o.status in ('submitted','confirmed')
      and o.grand_total_minor is not null
      and o.grand_total_minor>0
      and exists (
        select 1
        from public.commercial_reservations cr
        where cr.tenant_id=o.tenant_id
          and cr.order_id=o.id
          and cr.status in ('reserved','confirmed')
          and cr.offering_id is not null
      )
  ), order_offering as (
    select co.id as order_id,co.grand_total_minor,off.metadata
    from contractable_orders co
    left join lateral (
      select cr.offering_id
      from public.commercial_reservations cr
      where cr.tenant_id=co.tenant_id
        and cr.order_id=co.id
        and cr.status in ('reserved','confirmed')
        and cr.offering_id is not null
      order by cr.created_at desc
      limit 1
    ) cr on true
    left join public.offerings off on off.tenant_id=co.tenant_id and off.id=cr.offering_id
  ), schedule_eval as (
    select oo.order_id,oo.grand_total_minor,oo.metadata,
      case when jsonb_typeof(oo.metadata->'payment_schedule_v1')='array' then (
        select case
          when count(*)>0
           and count(*) filter (
             where coalesce(item->>'installment_number','') ~ '^[0-9]+$'
               and (item->>'installment_number')::integer>0
               and coalesce(item->>'amount_minor','') ~ '^[0-9]+$'
               and (item->>'amount_minor')::bigint>0
               and (
                 nullif(btrim(coalesce(item->>'due_date','')),'') is not null
                 or nullif(btrim(coalesce(item->>'due_rule','')),'') is not null
               )
           )=count(*)
           and coalesce(sum(
             case when coalesce(item->>'amount_minor','') ~ '^[0-9]+$'
               then (item->>'amount_minor')::bigint else 0 end
           ),0)=oo.grand_total_minor
          then true else false end
        from jsonb_array_elements(oo.metadata->'payment_schedule_v1') item
      ) else false end as payment_ready
    from order_offering oo
  )
  select
    count(*) filter (
      where nullif(btrim(coalesce(metadata->>'commercial_terms_version','')),'') is not null
    )::integer,
    count(*) filter (where payment_ready)::integer
  into v_terms_ready_count,v_payment_ready_count
  from schedule_eval;

  v_legal_ready := v_template.id is not null
    and v_template.status='active'
    and v_template.legal_reviewed_at is not null
    and v_privacy.id is not null
    and v_privacy.legal_reviewed_at is not null
    and nullif(btrim(coalesce(v_privacy.legal_review_reference,'')),'') is not null;

  v_technical_ready := v_journey_count>0
    and v_supplier_total>0
    and v_supplier_ready=v_supplier_total
    and v_order_count>0
    and v_party_ready_count=v_order_count
    and v_terms_ready_count=v_order_count
    and v_payment_ready_count=v_order_count;

  return jsonb_build_object(
    'operation_id',v_operation.id,
    'template_key',v_template_key,
    'technical_ready',v_technical_ready,
    'legal_ready',v_legal_ready,
    'provider_send_ready',false,
    'checks',jsonb_build_array(
      jsonb_build_object('key','template_formal_legal_review','label','Template V3.1 com revisão jurídica formal','status',case when v_template.id is not null and v_template.status='active' and v_template.legal_reviewed_at is not null then 'ready' else 'blocked' end,'kind','legal','detail',coalesce(v_template.status,'missing')),
      jsonb_build_object('key','privacy_policy_active','label','Política de privacidade ativa e juridicamente revisada','status',case when v_privacy.id is not null and v_privacy.legal_reviewed_at is not null and nullif(btrim(coalesce(v_privacy.legal_review_reference,'')),'') is not null then 'ready' else 'blocked' end,'kind','legal','detail',case when v_privacy.id is null then 'active_policy_missing' else v_privacy.version end),
      jsonb_build_object('key','program_snapshot_source','label','Programação do viajante disponível','status',case when v_journey_count>0 then 'ready' else 'blocked' end,'kind','technical','detail',v_journey_count||' etapas'),
      jsonb_build_object('key','contracted_suppliers','label','Fornecedores contratados com evidência jurídica','status',case when v_supplier_total>0 and v_supplier_ready=v_supplier_total then 'ready' else 'blocked' end,'kind','technical','detail',v_supplier_ready||'/'||v_supplier_total||' completos'),
      jsonb_build_object('key','commercial_terms','label','Pedidos com reserva ativa e termos comerciais versionados','status',case when v_order_count>0 and v_terms_ready_count=v_order_count then 'ready' else 'blocked' end,'kind','technical','detail',v_terms_ready_count||'/'||v_order_count||' completos'),
      jsonb_build_object('key','customer_contract_data','label','Pedidos com reserva ativa e dados jurídicos do viajante','status',case when v_order_count>0 and v_party_ready_count=v_order_count then 'ready' else 'blocked' end,'kind','technical','detail',v_party_ready_count||'/'||v_order_count||' completos'),
      jsonb_build_object('key','payment_schedule','label','Plano de pagamento compatível com cada pedido de reserva ativa','status',case when v_order_count>0 and v_payment_ready_count=v_order_count then 'ready' else 'blocked' end,'kind','technical','detail',v_payment_ready_count||'/'||v_order_count||' compatíveis')
    ),
    'note','Leitura de prontidão somente. Pedidos sem reserva ativa não são considerados contratáveis.'
  );
end;
$$;

revoke all on function public.get_operation_contract_readiness(uuid,text) from public,anon;
grant execute on function public.get_operation_contract_readiness(uuid,text) to authenticated,service_role;

comment on function public.get_operation_contract_readiness(uuid,text) is
  'Read-only contract readiness projection v3. Contractable orders require a live commercial reservation; provider send remains locked.';
