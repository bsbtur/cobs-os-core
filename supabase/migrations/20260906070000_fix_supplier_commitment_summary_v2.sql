-- COBS OS · Procurement commitment summary V2
-- Fixes quote amount multiplication when a contracted quote has multiple installments.
-- No supplier, quote, schedule, payment, or financial data is mutated.

create or replace view public.operation_supplier_commitment_summary
with (security_invoker=true) as
with contracted_quotes as (
  select
    q.tenant_id,
    q.operation_id,
    sum(q.amount_minor)::bigint as contracted_total_minor,
    count(distinct q.supplier_id)::int as contracted_suppliers
  from public.operation_quotes q
  where q.status = 'contracted'
  group by q.tenant_id, q.operation_id
),
contracted_schedules as (
  select
    q.tenant_id,
    q.operation_id,
    coalesce(sum(ps.amount_minor) filter (where ps.status = 'paid'), 0)::bigint as paid_total_minor,
    coalesce(sum(ps.amount_minor) filter (where ps.status in ('planned', 'due')), 0)::bigint as scheduled_outstanding_minor,
    min(ps.due_date) filter (where ps.status in ('planned', 'due')) as next_due_date,
    count(ps.id) filter (where ps.status in ('planned', 'due'))::int as open_installments
  from public.operation_quotes q
  left join public.quote_payment_schedule ps
    on ps.quote_id = q.id
   and ps.tenant_id = q.tenant_id
   and ps.status <> 'cancelled'
  where q.status = 'contracted'
  group by q.tenant_id, q.operation_id
)
select
  o.tenant_id,
  o.id as operation_id,
  coalesce(cq.contracted_total_minor, 0)::bigint as contracted_total_minor,
  coalesce(cs.paid_total_minor, 0)::bigint as paid_total_minor,
  coalesce(cs.scheduled_outstanding_minor, 0)::bigint as scheduled_outstanding_minor,
  (coalesce(cq.contracted_total_minor, 0) - coalesce(cs.paid_total_minor, 0))::bigint as contract_balance_minor,
  cs.next_due_date,
  coalesce(cq.contracted_suppliers, 0)::int as contracted_suppliers,
  coalesce(cs.open_installments, 0)::int as open_installments
from public.operations o
left join contracted_quotes cq
  on cq.tenant_id = o.tenant_id
 and cq.operation_id = o.id
left join contracted_schedules cs
  on cs.tenant_id = o.tenant_id
 and cs.operation_id = o.id;

grant select on public.operation_supplier_commitment_summary to authenticated;
