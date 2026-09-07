-- COBS OS · Procurement quote read projection v1
-- Read-only RPC for the operation supplier workspace.
-- No supplier, quote, payment or contractual state is mutated.

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

revoke all on function public.get_operation_procurement_quotes(uuid) from public,anon;
grant execute on function public.get_operation_procurement_quotes(uuid) to authenticated,service_role;

comment on function public.get_operation_procurement_quotes(uuid) is
  'Returns the authorized operation procurement quote projection for owner/admin/operations_agent without mutating procurement or contractual state.';
