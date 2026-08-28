-- COBS OS · n8n automation foundation
-- Canonical truth remains in Postgres. n8n orchestrates work but never becomes
-- the owner of tenant, operation, commercial, or audit state.

create table public.automation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  source text not null check (length(btrim(source)) between 2 and 40),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 160),
  correlation_id text not null check (length(btrim(correlation_id)) between 8 and 160),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  dispatch_status text not null default 'pending'
    check (dispatch_status in ('pending', 'dispatched', 'completed', 'failed')),
  dispatch_attempts integer not null default 0 check (dispatch_attempts >= 0),
  last_error_code text,
  last_error_message text,
  dispatched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source, idempotency_key),
  unique (id, tenant_id),
  foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id) on delete set null (operation_id),
  check (operation_id is not null or event_type = 'lead.created')
);

create index automation_events_tenant_created_idx
  on public.automation_events (tenant_id, created_at desc);
create index automation_events_pending_idx
  on public.automation_events (dispatch_status, created_at)
  where dispatch_status in ('pending', 'failed');

create trigger automation_events_updated_at
  before update on public.automation_events
  for each row execute function public.set_updated_at();

create table public.automation_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  automation_event_id uuid not null,
  outcome text not null check (outcome in ('completed', 'failed')),
  intent text check (intent is null or intent in (
    'price', 'installment', 'group', 'ready_to_buy', 'human_support', 'other'
  )),
  urgency text check (urgency is null or urgency in ('low', 'medium', 'high')),
  summary text check (summary is null or length(summary) <= 500),
  suggested_reply text check (suggested_reply is null or length(suggested_reply) <= 600),
  error_code text,
  error_message text,
  provider_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (automation_event_id, tenant_id)
    references public.automation_events(id, tenant_id) on delete cascade,
  unique (automation_event_id)
);

create index automation_results_tenant_created_idx
  on public.automation_results (tenant_id, created_at desc);

create or replace function app_private.reject_automation_result_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'automation_results is append-only';
end;
$$;

revoke all on function app_private.reject_automation_result_mutation()
  from public, anon, authenticated;

create trigger automation_results_immutable
  before update or delete on public.automation_results
  for each row execute function app_private.reject_automation_result_mutation();

revoke all on public.automation_events, public.automation_results from anon, authenticated;
grant select on public.automation_events, public.automation_results to authenticated;
grant all on public.automation_events, public.automation_results to service_role;

alter table public.automation_events enable row level security;
alter table public.automation_results enable row level security;

create policy automation_events_select_member
  on public.automation_events for select to authenticated
  using (app_private.is_tenant_member(tenant_id));

create policy automation_results_select_member
  on public.automation_results for select to authenticated
  using (app_private.is_tenant_member(tenant_id));

comment on table public.automation_events is
  'Tenant-scoped commands/events dispatched to external orchestrators such as n8n.';
comment on table public.automation_results is
  'Append-only result evidence returned by an automation orchestrator.';
