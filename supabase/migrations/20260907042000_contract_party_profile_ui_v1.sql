-- COBS OS · Contract party profile UI v1
-- Read contractable travelers by operation and let owner/admin maintain only the buyer's contractual identity/address.
-- No customer contract generation, provider call, legal activation, supplier mutation or payment mutation.

create or replace function public.get_operation_contract_parties(_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_op public.operations%rowtype;
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_op from public.operations where id=_operation_id;
  if not found then raise exception 'operation_not_found'; end if;

  if not app_private.has_tenant_role(
    v_op.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then
    raise exception 'forbidden';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',o.id,
    'buyer_person_id',o.buyer_person_id,
    'buyer_name',p.full_name,
    'order_status',o.status,
    'reservation_status',r.status,
    'document_type',cpp.document_type,
    'document_number',cpp.document_number,
    'address_line1',cpp.address_line1,
    'address_line2',cpp.address_line2,
    'district',cpp.district,
    'city',cpp.city,
    'state_region',cpp.state_region,
    'postal_code',cpp.postal_code,
    'country_code',cpp.country_code,
    'contract_party_profile_complete',
      cpp.person_id is not null
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
  join lateral (
    select cr.status,cr.offering_id
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
  where o.tenant_id=v_op.tenant_id
    and o.operation_id=v_op.id
    and o.status in ('submitted','confirmed')
    and o.buyer_person_id is not null
    and o.grand_total_minor is not null
    and o.grand_total_minor>0;

  return v_rows;
end;
$$;

revoke all on function public.get_operation_contract_parties(uuid) from public,anon;
grant execute on function public.get_operation_contract_parties(uuid) to authenticated,service_role;

comment on function public.get_operation_contract_parties(uuid) is
  'Read-only owner/admin/operations_agent projection of contractable orders and buyer contractual profile evidence.';

create or replace function public.upsert_order_contract_party_profile(
  _order_id uuid,
  _document_type text,
  _document_number text,
  _address_line1 text,
  _address_line2 text default null,
  _district text default null,
  _city text default null,
  _state_region text default null,
  _postal_code text default null,
  _country_code text default null
) returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_document_type text := lower(nullif(btrim(coalesce(_document_type,'')),''));
  v_document_number text := nullif(btrim(coalesce(_document_number,'')),'');
  v_address_line1 text := nullif(btrim(coalesce(_address_line1,'')),'');
  v_address_line2 text := nullif(btrim(coalesce(_address_line2,'')),'');
  v_district text := nullif(btrim(coalesce(_district,'')),'');
  v_city text := nullif(btrim(coalesce(_city,'')),'');
  v_state_region text := nullif(btrim(coalesce(_state_region,'')),'');
  v_postal_code text := nullif(btrim(coalesce(_postal_code,'')),'');
  v_country_code text := upper(nullif(btrim(coalesce(_country_code,'')),''));
  v_profile_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_order
  from public.orders
  where id=_order_id
  for update;
  if not found then raise exception 'order_not_found'; end if;

  if not app_private.has_tenant_role(
    v_order.tenant_id,
    array['owner','admin']::public.app_role[]
  ) then
    raise exception 'forbidden';
  end if;

  if v_order.buyer_person_id is null then raise exception 'buyer_person_required'; end if;
  if v_order.status not in ('submitted','confirmed') then raise exception 'order_not_contractable'; end if;
  if not exists (
    select 1
    from public.commercial_reservations cr
    where cr.tenant_id=v_order.tenant_id
      and cr.order_id=v_order.id
      and cr.status in ('reserved','confirmed')
      and cr.offering_id is not null
  ) then
    raise exception 'active_reservation_required';
  end if;

  if v_document_type not in ('cpf','passport','other') then
    raise exception 'contract_party_document_type_invalid';
  end if;
  if v_document_number is null
     or v_address_line1 is null
     or v_city is null
     or v_state_region is null
     or v_postal_code is null
     or v_country_code is null then
    raise exception 'contract_party_profile_fields_required';
  end if;
  if length(v_country_code)<>2 then raise exception 'contract_party_country_code_invalid'; end if;

  insert into public.contract_party_profiles(
    tenant_id,person_id,document_type,document_number,
    address_line1,address_line2,district,city,state_region,postal_code,country_code,created_by
  ) values (
    v_order.tenant_id,v_order.buyer_person_id,v_document_type,v_document_number,
    v_address_line1,v_address_line2,v_district,v_city,v_state_region,v_postal_code,v_country_code,v_uid
  )
  on conflict (tenant_id,person_id) do update
  set document_type=excluded.document_type,
      document_number=excluded.document_number,
      address_line1=excluded.address_line1,
      address_line2=excluded.address_line2,
      district=excluded.district,
      city=excluded.city,
      state_region=excluded.state_region,
      postal_code=excluded.postal_code,
      country_code=excluded.country_code,
      updated_at=now()
  returning id into v_profile_id;

  perform app_private.record_audit_event(
    v_order.tenant_id,
    v_uid,
    'contract_party.profile_updated',
    'contract_party_profile',
    v_profile_id,
    null,
    jsonb_build_object(
      'order_id',v_order.id,
      'person_id',v_order.buyer_person_id,
      'profile_complete',true,
      'updated_fields',jsonb_build_array(
        'document_type','document_number','address_line1','address_line2','district',
        'city','state_region','postal_code','country_code'
      )
    )
  );

  return jsonb_build_object(
    'order_id',v_order.id,
    'contract_party_profile_id',v_profile_id,
    'profile_complete',true
  );
end;
$$;

revoke all on function public.upsert_order_contract_party_profile(uuid,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.upsert_order_contract_party_profile(uuid,text,text,text,text,text,text,text,text,text) to authenticated,service_role;

comment on function public.upsert_order_contract_party_profile(uuid,text,text,text,text,text,text,text,text,text) is
  'Owner/admin-only audited upsert of the buyer contractual identity/address for a live-reservation order. Never generates or sends a contract.';
