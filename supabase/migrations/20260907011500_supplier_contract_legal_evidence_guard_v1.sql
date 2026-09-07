-- COBS OS · Supplier contract legal-evidence guard v1
-- Ensures a supplier cannot become contractual evidence until its legal identity,
-- commercial address and contract reference are complete.
-- No supplier is contracted by this migration and no payment/provider call occurs.

create or replace function public.contract_operation_quote(
  _quote_id uuid,
  _contract_reference text default null,
  _contract_notes text default null
) returns jsonb
language plpgsql security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_q public.operation_quotes%rowtype;
  v_s public.suppliers%rowtype;
  v_reference text := nullif(btrim(coalesce(_contract_reference,'')),'');
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_q
  from public.operation_quotes
  where id=_quote_id
  for update;
  if not found then raise exception 'quote_not_found'; end if;

  if not app_private.has_tenant_role(v_q.tenant_id,array['owner','admin']::public.app_role[]) then
    raise exception 'forbidden';
  end if;

  if v_q.status='contracted' then
    return jsonb_build_object(
      'quote_id',v_q.id,
      'status','contracted',
      'contract_reference',v_q.contract_reference,
      'idempotent',true
    );
  end if;

  if v_q.status<>'selected' then raise exception 'quote_must_be_selected'; end if;

  select * into v_s
  from public.suppliers
  where id=v_q.supplier_id and tenant_id=v_q.tenant_id;
  if not found then raise exception 'supplier_not_found'; end if;

  if nullif(btrim(coalesce(v_s.legal_name,v_s.name,'')),'') is null
     or nullif(btrim(coalesce(v_s.document_number,'')),'') is null
     or nullif(btrim(coalesce(v_s.address_line1,'')),'') is null
     or nullif(btrim(coalesce(v_s.city,'')),'') is null
     or nullif(btrim(coalesce(v_s.state_region,'')),'') is null
     or nullif(btrim(coalesce(v_s.postal_code,'')),'') is null
     or nullif(btrim(coalesce(v_s.country_code,'')),'') is null then
    raise exception 'supplier_legal_evidence_required';
  end if;

  if v_reference is null then raise exception 'contract_reference_required'; end if;

  update public.operation_quotes
  set status='contracted',
      contracted_at=coalesce(contracted_at,now()),
      contract_reference=v_reference,
      contract_notes=nullif(btrim(coalesce(_contract_notes,'')),''),
      updated_at=now()
  where id=v_q.id;

  perform app_private.record_audit_event(
    v_q.tenant_id,
    v_uid,
    'supplier.contract_formalized',
    'operation_quote',
    v_q.id,
    null,
    jsonb_build_object(
      'operation_id',v_q.operation_id,
      'supplier_id',v_q.supplier_id,
      'category',v_q.category,
      'amount_minor',v_q.amount_minor,
      'contract_reference',v_reference,
      'legal_evidence_checked',true
    )
  );

  return jsonb_build_object(
    'quote_id',v_q.id,
    'status','contracted',
    'contract_reference',v_reference,
    'idempotent',false
  );
end;
$$;

revoke all on function public.contract_operation_quote(uuid,text,text) from public,anon;
grant execute on function public.contract_operation_quote(uuid,text,text) to authenticated,service_role;

comment on function public.contract_operation_quote(uuid,text,text) is
  'Contracts a selected supplier quote only after legal identity, commercial address and contract reference are complete; repeated calls after contraction are idempotent.';
