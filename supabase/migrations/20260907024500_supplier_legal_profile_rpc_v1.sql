-- COBS OS · Supplier legal profile RPC v1
-- Lets owner/admin complete the supplier legal registry used by contract preflight.
-- Does not select/contract a quote, generate a customer contract, call a provider or move money.

create or replace function public.update_supplier_contract_legal_profile(
  _supplier_id uuid,
  _legal_name text,
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
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_s public.suppliers%rowtype;
  v_legal_name text := nullif(btrim(coalesce(_legal_name,'')),'');
  v_document_number text := nullif(btrim(coalesce(_document_number,'')),'');
  v_address_line1 text := nullif(btrim(coalesce(_address_line1,'')),'');
  v_address_line2 text := nullif(btrim(coalesce(_address_line2,'')),'');
  v_district text := nullif(btrim(coalesce(_district,'')),'');
  v_city text := nullif(btrim(coalesce(_city,'')),'');
  v_state_region text := nullif(btrim(coalesce(_state_region,'')),'');
  v_postal_code text := nullif(btrim(coalesce(_postal_code,'')),'');
  v_country_code text := upper(nullif(btrim(coalesce(_country_code,'')),''));
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_s
  from public.suppliers
  where id=_supplier_id
  for update;
  if not found then raise exception 'supplier_not_found'; end if;

  if not app_private.has_tenant_role(
    v_s.tenant_id,
    array['owner','admin']::public.app_role[]
  ) then
    raise exception 'forbidden';
  end if;

  if v_legal_name is null
     or v_document_number is null
     or v_address_line1 is null
     or v_city is null
     or v_state_region is null
     or v_postal_code is null
     or v_country_code is null then
    raise exception 'supplier_legal_evidence_required';
  end if;

  if length(v_country_code) <> 2 then
    raise exception 'supplier_country_code_invalid';
  end if;

  update public.suppliers
  set legal_name=v_legal_name,
      document_number=v_document_number,
      address_line1=v_address_line1,
      address_line2=v_address_line2,
      district=v_district,
      city=v_city,
      state_region=v_state_region,
      postal_code=v_postal_code,
      country_code=v_country_code,
      updated_at=now()
  where id=v_s.id;

  perform app_private.record_audit_event(
    v_s.tenant_id,
    v_uid,
    'supplier.legal_profile_updated',
    'supplier',
    v_s.id,
    null,
    jsonb_build_object(
      'legal_evidence_complete',true,
      'updated_fields',jsonb_build_array(
        'legal_name','document_number','address_line1','address_line2','district',
        'city','state_region','postal_code','country_code'
      )
    )
  );

  return jsonb_build_object(
    'supplier_id',v_s.id,
    'legal_evidence_complete',true
  );
end;
$$;

revoke all on function public.update_supplier_contract_legal_profile(uuid,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.update_supplier_contract_legal_profile(uuid,text,text,text,text,text,text,text,text,text) to authenticated,service_role;

comment on function public.update_supplier_contract_legal_profile(uuid,text,text,text,text,text,text,text,text,text) is
  'Owner/admin-only audited update of the complete supplier legal identity and commercial address used by contract preflight; never changes quote status.';

-- Extend the existing read-only projection so the UI can show legal evidence completeness
-- without querying supplier tables directly.
create or replace function public.get_operation_procurement_quotes(_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_op public.operations%rowtype;
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_op
  from public.operations
  where id=_operation_id;
  if not found then raise exception 'operation_not_found'; end if;

  if not app_private.has_tenant_role(
    v_op.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then
    raise exception 'forbidden';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'supplier_id', q.supplier_id,
        'supplier_name', s.name,
        'supplier_legal_name', s.legal_name,
        'supplier_document_number', s.document_number,
        'supplier_address_line1', s.address_line1,
        'supplier_address_line2', s.address_line2,
        'supplier_district', s.district,
        'supplier_city', s.city,
        'supplier_state_region', s.state_region,
        'supplier_postal_code', s.postal_code,
        'supplier_country_code', s.country_code,
        'supplier_legal_evidence_complete',
          nullif(btrim(coalesce(s.legal_name,s.name,'')),'') is not null
          and nullif(btrim(coalesce(s.document_number,'')),'') is not null
          and nullif(btrim(coalesce(s.address_line1,'')),'') is not null
          and nullif(btrim(coalesce(s.city,'')),'') is not null
          and nullif(btrim(coalesce(s.state_region,'')),'') is not null
          and nullif(btrim(coalesce(s.postal_code,'')),'') is not null
          and nullif(btrim(coalesce(s.country_code,'')),'') is not null,
        'category', q.category,
        'description', q.description,
        'amount_minor', q.amount_minor,
        'currency_code', q.currency_code,
        'status', q.status,
        'valid_until', q.valid_until,
        'contract_reference', q.contract_reference,
        'created_at', q.created_at
      )
      order by q.created_at desc
    ),
    '[]'::jsonb
  ) into v_rows
  from public.operation_quotes q
  join public.suppliers s
    on s.id=q.supplier_id and s.tenant_id=q.tenant_id
  where q.operation_id=v_op.id
    and q.tenant_id=v_op.tenant_id;

  return v_rows;
end;
$$;
