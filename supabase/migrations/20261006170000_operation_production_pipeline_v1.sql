-- COBS OS · Operation production pipeline v1
-- Read-only projection for the manager procurement workspace.
-- Stages: planned -> quoted -> selected -> contracted -> documented.
-- No supplier, quote, payment or contractual state is mutated.

create or replace function public.get_operation_production_pipeline(_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  v_uid uuid := auth.uid();
  v_op public.operations%rowtype;
  v_rows jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  select * into v_op
  from public.operations
  where id=_operation_id;

  if not found then
    raise exception 'operation_not_found';
  end if;

  if not app_private.has_tenant_role(
    v_op.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then
    raise exception 'forbidden';
  end if;

  with supplier_scope as (
    select distinct s.id, s.name, s.category
    from public.suppliers s
    join (
      select q.tenant_id, q.supplier_id
      from public.operation_quotes q
      where q.operation_id=v_op.id
        and q.tenant_id=v_op.tenant_id

      union

      select d.tenant_id, d.supplier_id
      from public.supplier_documents d
      where d.operation_id=v_op.id
        and d.tenant_id=v_op.tenant_id
    ) x on x.tenant_id=s.tenant_id and x.supplier_id=s.id
    where s.tenant_id=v_op.tenant_id
  ),
  active_quotes as (
    select
      q.*,
      row_number() over (
        partition by q.supplier_id
        order by
          case q.status
            when 'contracted' then 4
            when 'selected' then 3
            when 'shortlisted' then 2
            when 'quoted' then 1
            else 0
          end desc,
          q.updated_at desc,
          q.created_at desc
      ) as rn
    from public.operation_quotes q
    where q.operation_id=v_op.id
      and q.tenant_id=v_op.tenant_id
      and q.status in ('quoted','shortlisted','selected','contracted')
  ),
  document_summary as (
    select
      d.supplier_id,
      count(*)::int as total_documents,
      count(*) filter (where d.status='pending')::int as pending_documents,
      count(*) filter (where d.status='received')::int as received_documents,
      count(*) filter (where d.status='approved')::int as approved_documents,
      count(*) filter (where d.status='rejected')::int as rejected_documents,
      count(*) filter (where d.status='expired')::int as expired_documents
    from public.supplier_documents d
    where d.operation_id=v_op.id
      and d.tenant_id=v_op.tenant_id
    group by d.supplier_id
  ),
  rows as (
    select
      s.id as supplier_id,
      s.name as supplier_name,
      coalesce(q.category, s.category, 'other') as category,
      q.status as quote_status,
      q.amount_minor,
      q.currency_code,
      q.description,
      coalesce(ds.total_documents,0) as total_documents,
      coalesce(ds.pending_documents,0) as pending_documents,
      coalesce(ds.received_documents,0) as received_documents,
      coalesce(ds.approved_documents,0) as approved_documents,
      coalesce(ds.rejected_documents,0) as rejected_documents,
      coalesce(ds.expired_documents,0) as expired_documents,
      case
        when q.status='contracted'
          and coalesce(ds.total_documents,0) > 0
          and coalesce(ds.approved_documents,0) = coalesce(ds.total_documents,0)
          then 'documented'
        when q.status='contracted' then 'contracted'
        when q.status='selected' then 'selected'
        when q.status in ('quoted','shortlisted') then 'quoted'
        else 'planned'
      end as stage,
      case
        when q.status='contracted'
          and coalesce(ds.total_documents,0) > 0
          and coalesce(ds.approved_documents,0) = coalesce(ds.total_documents,0)
          then 5
        when q.status='contracted' then 4
        when q.status='selected' then 3
        when q.status in ('quoted','shortlisted') then 2
        else 1
      end as stage_rank
    from supplier_scope s
    left join active_quotes q
      on q.supplier_id=s.id and q.rn=1
    left join document_summary ds
      on ds.supplier_id=s.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'supplier_id', supplier_id,
        'supplier_name', supplier_name,
        'category', category,
        'stage', stage,
        'quote_status', quote_status,
        'amount_minor', amount_minor,
        'currency_code', currency_code,
        'description', description,
        'total_documents', total_documents,
        'pending_documents', pending_documents,
        'received_documents', received_documents,
        'approved_documents', approved_documents,
        'rejected_documents', rejected_documents,
        'expired_documents', expired_documents
      )
      order by stage_rank desc, category asc, supplier_name asc
    ),
    '[]'::jsonb
  )
  into v_rows
  from rows;

  return v_rows;
end;
$$;

revoke all on function public.get_operation_production_pipeline(uuid) from public,anon;
grant execute on function public.get_operation_production_pipeline(uuid) to authenticated,service_role;

comment on function public.get_operation_production_pipeline(uuid) is
  'Returns the authorized supplier production pipeline for an operation, including planned suppliers without a priced quote. Documented requires a contracted quote and all linked supplier documents approved. Read-only; does not mutate procurement, contracts or payments.';
