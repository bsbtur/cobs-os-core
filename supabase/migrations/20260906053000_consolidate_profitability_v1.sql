-- COBS OS · Consolidation V3.1 -> canonical main
-- Operation profitability planning. Schema/capability only: no STAGING plan data is copied.

create table public.operation_financial_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  expected_paying_passengers integer not null check (expected_paying_passengers > 0),
  target_unit_price_minor bigint not null default 0 check (target_unit_price_minor >= 0),
  contingency_minor bigint not null default 0 check (contingency_minor >= 0),
  tax_fee_minor bigint not null default 0 check (tax_fee_minor >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id),
  unique (operation_id, tenant_id)
);

alter table public.operation_financial_plans enable row level security;

create policy "Elevated roles read operation financial plans"
on public.operation_financial_plans
for select to authenticated
using (
  app_private.has_tenant_role(
    tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  )
);

create policy "Owners and admins manage operation financial plans"
on public.operation_financial_plans
for all to authenticated
using (
  app_private.has_tenant_role(
    tenant_id,
    array['owner','admin']::public.app_role[]
  )
)
with check (
  app_private.has_tenant_role(
    tenant_id,
    array['owner','admin']::public.app_role[]
  )
);

-- Least privilege: unlike the historical V3.1 grants, anonymous callers receive no table capability.
revoke all on public.operation_financial_plans from public, anon;
grant select on public.operation_financial_plans to authenticated;
grant insert, update, delete on public.operation_financial_plans to authenticated;
grant all on public.operation_financial_plans to service_role;

create or replace view public.operation_profitability_summary
with (security_invoker=true) as
select
  o.tenant_id,
  o.id as operation_id,
  fp.expected_paying_passengers,
  fp.target_unit_price_minor,
  coalesce(fp.expected_paying_passengers::bigint * fp.target_unit_price_minor, 0::bigint) as gross_revenue_minor,
  coalesce(cs.selected_cost_minor, 0::bigint) as selected_cost_minor,
  coalesce(fp.contingency_minor, 0::bigint) as contingency_minor,
  coalesce(fp.tax_fee_minor, 0::bigint) as tax_fee_minor,
  coalesce(cs.selected_cost_minor, 0::bigint)
    + coalesce(fp.contingency_minor, 0::bigint)
    + coalesce(fp.tax_fee_minor, 0::bigint) as total_planned_cost_minor,
  coalesce(fp.expected_paying_passengers::bigint * fp.target_unit_price_minor, 0::bigint)
    - (
      coalesce(cs.selected_cost_minor, 0::bigint)
      + coalesce(fp.contingency_minor, 0::bigint)
      + coalesce(fp.tax_fee_minor, 0::bigint)
    ) as projected_profit_minor,
  case
    when coalesce(fp.expected_paying_passengers::bigint * fp.target_unit_price_minor, 0::bigint) > 0
      then round(
        (
          coalesce(fp.expected_paying_passengers::bigint * fp.target_unit_price_minor, 0::bigint)
          - (
            coalesce(cs.selected_cost_minor, 0::bigint)
            + coalesce(fp.contingency_minor, 0::bigint)
            + coalesce(fp.tax_fee_minor, 0::bigint)
          )
        )::numeric
        / (fp.expected_paying_passengers::bigint * fp.target_unit_price_minor)::numeric * 100,
        2
      )
    else null::numeric
  end as margin_pct,
  case
    when coalesce(fp.target_unit_price_minor, 0::bigint) > 0
      then ceil(
        (
          coalesce(cs.selected_cost_minor, 0::bigint)
          + coalesce(fp.contingency_minor, 0::bigint)
          + coalesce(fp.tax_fee_minor, 0::bigint)
        )::numeric / fp.target_unit_price_minor::numeric
      )::integer
    else null::integer
  end as break_even_passengers
from public.operations o
left join public.operation_financial_plans fp
  on fp.operation_id=o.id and fp.tenant_id=o.tenant_id
left join public.operation_cost_summary cs
  on cs.operation_id=o.id and cs.tenant_id=o.tenant_id;

revoke all on public.operation_profitability_summary from public, anon;
grant select on public.operation_profitability_summary to authenticated, service_role;
