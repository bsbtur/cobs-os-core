create table public.operation_document_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  requirement_key text not null,
  label text not null,
  description text null,
  required boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, requirement_key)
);

create table public.participant_document_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  requirement_id uuid not null references public.operation_document_requirements(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','submitted','verified','rejected','waived')),
  notes text null,
  submitted_at timestamptz null,
  verified_at timestamptz null,
  verified_by uuid null references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, person_id, requirement_id),
  constraint participant_document_verified_timestamp check (status <> 'verified' or verified_at is not null)
);

create index operation_document_requirements_operation_idx on public.operation_document_requirements(operation_id, active, required);
create index participant_document_checks_person_idx on public.participant_document_checks(operation_id, person_id, status);

alter table public.operation_document_requirements enable row level security;
alter table public.participant_document_checks enable row level security;

create policy operation_document_requirements_read_ops on public.operation_document_requirements
for select to authenticated
using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));
create policy operation_document_requirements_write_ops on public.operation_document_requirements
for all to authenticated
using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]))
with check (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

create policy participant_document_checks_read_ops on public.participant_document_checks
for select to authenticated
using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));
create policy participant_document_checks_write_ops on public.participant_document_checks
for all to authenticated
using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]))
with check (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

revoke all on public.operation_document_requirements from anon;
revoke all on public.participant_document_checks from anon;
grant select,insert,update,delete on public.operation_document_requirements to authenticated;
grant select,insert,update,delete on public.participant_document_checks to authenticated;

create trigger operation_document_requirements_set_updated_at before update on public.operation_document_requirements for each row execute function public.set_updated_at();
create trigger participant_document_checks_set_updated_at before update on public.participant_document_checks for each row execute function public.set_updated_at();

create or replace view public.operation_participant_readiness
with (security_invoker=true)
as
with participant_orders as (
  select distinct op.operation_id, op.person_id, o.id as order_id, o.grand_total_minor
  from public.operation_participations op
  join public.order_items oi on oi.beneficiary_person_id=op.person_id
  join public.orders o on o.id=oi.order_id and o.operation_id=op.operation_id and o.tenant_id=op.tenant_id
  where op.participation_kind='participant' and op.status<>'cancelled' and o.status<>'cancelled'
),
finance as (
  select po.operation_id, po.person_id,
         bool_or(coalesce(ff.net_paid_minor,0) >= po.grand_total_minor and po.grand_total_minor > 0) as finance_ok,
         max(coalesce(ff.net_paid_minor,0)) as net_paid_minor,
         max(po.grand_total_minor) as required_amount_minor
  from participant_orders po
  left join lateral (
    select sum(case when fact_type='PAYMENT_RECORDED' then amount_minor when fact_type in ('PAYMENT_REVERSED','REFUND_RECORDED') then -amount_minor else 0 end)::bigint as net_paid_minor
    from public.financial_facts f where f.order_id=po.order_id
  ) ff on true
  group by po.operation_id,po.person_id
),
contracts as (
  select operation_id,customer_person_id as person_id,bool_or(status='signed') as contract_ok
  from public.customer_contracts
  group by operation_id,customer_person_id
),
doc_requirements as (
  select operation_id,count(*) filter (where active and required)::int as required_count
  from public.operation_document_requirements group by operation_id
),
docs as (
  select r.operation_id,p.person_id,
         count(*) filter (where r.active and r.required)::int as required_count,
         count(*) filter (where r.active and r.required and c.status in ('verified','waived'))::int as satisfied_count
  from public.operation_document_requirements r
  join public.operation_participations p on p.operation_id=r.operation_id and p.tenant_id=r.tenant_id and p.participation_kind='participant' and p.status<>'cancelled'
  left join public.participant_document_checks c on c.requirement_id=r.id and c.operation_id=r.operation_id and c.person_id=p.person_id
  group by r.operation_id,p.person_id
)
select
  op.tenant_id,
  op.operation_id,
  op.id as participation_id,
  op.person_id,
  p.full_name,
  p.email,
  op.status as participation_status,
  coalesce(f.finance_ok,false) as finance_ok,
  coalesce(f.net_paid_minor,0) as net_paid_minor,
  coalesce(f.required_amount_minor,0) as required_amount_minor,
  coalesce(c.contract_ok,false) as contract_ok,
  case when coalesce(dr.required_count,0)=0 then 'not_configured'
       when coalesce(d.satisfied_count,0)>=coalesce(d.required_count,0) then 'ok'
       else 'pending' end as documentation_state,
  (coalesce(dr.required_count,0)>0 and coalesce(d.satisfied_count,0)>=coalesce(d.required_count,0)) as documentation_ok,
  coalesce(d.satisfied_count,0) as documentation_satisfied,
  coalesce(dr.required_count,0) as documentation_required,
  (op.status='confirmed' and coalesce(f.finance_ok,false) and coalesce(c.contract_ok,false) and coalesce(dr.required_count,0)>0 and coalesce(d.satisfied_count,0)>=coalesce(d.required_count,0)) as ready_to_board
from public.operation_participations op
join public.people p on p.id=op.person_id and p.tenant_id=op.tenant_id
left join finance f on f.operation_id=op.operation_id and f.person_id=op.person_id
left join contracts c on c.operation_id=op.operation_id and c.person_id=op.person_id
left join doc_requirements dr on dr.operation_id=op.operation_id
left join docs d on d.operation_id=op.operation_id and d.person_id=op.person_id
where op.participation_kind='participant' and op.status<>'cancelled';

grant select on public.operation_participant_readiness to authenticated;