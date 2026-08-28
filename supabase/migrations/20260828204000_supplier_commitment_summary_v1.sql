create or replace view public.operation_supplier_commitment_summary with (security_invoker=true) as
select
  o.tenant_id,
  o.id as operation_id,
  coalesce(sum(q.amount_minor) filter (where q.status='contracted'),0)::bigint as contracted_total_minor,
  coalesce(sum(ps.amount_minor) filter (where q.status='contracted' and ps.status='paid'),0)::bigint as paid_total_minor,
  coalesce(sum(ps.amount_minor) filter (where q.status='contracted' and ps.status in ('planned','due')),0)::bigint as scheduled_outstanding_minor,
  coalesce(sum(q.amount_minor) filter (where q.status='contracted'),0)::bigint - coalesce(sum(ps.amount_minor) filter (where q.status='contracted' and ps.status='paid'),0)::bigint as contract_balance_minor,
  min(ps.due_date) filter (where q.status='contracted' and ps.status in ('planned','due')) as next_due_date,
  count(distinct q.id) filter (where q.status='contracted')::int as contracted_suppliers,
  count(ps.id) filter (where q.status='contracted' and ps.status in ('planned','due'))::int as open_installments
from public.operations o
left join public.operation_quotes q on q.operation_id=o.id and q.tenant_id=o.tenant_id
left join public.quote_payment_schedule ps on ps.quote_id=q.id and ps.tenant_id=q.tenant_id and ps.status <> 'cancelled'
group by o.tenant_id,o.id;

grant select on public.operation_supplier_commitment_summary to authenticated;
