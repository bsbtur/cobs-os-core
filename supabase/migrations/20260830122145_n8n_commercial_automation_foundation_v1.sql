create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid null,
  actor_profile_id uuid null references public.profiles(id) on delete set null,
  event_type text not null,
  source text not null,
  idempotency_key text not null,
  correlation_id text not null,
  payload jsonb not null default '{}'::jsonb,
  dispatch_status text not null default 'pending'::text,
  dispatch_attempts integer not null default 0,
  last_error_code text null,
  last_error_message text null,
  dispatched_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_events_event_type_check check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint automation_events_source_check check (length(btrim(source)) >= 2 and length(btrim(source)) <= 40),
  constraint automation_events_idempotency_key_check check (length(btrim(idempotency_key)) >= 8 and length(btrim(idempotency_key)) <= 160),
  constraint automation_events_correlation_id_check check (length(btrim(correlation_id)) >= 8 and length(btrim(correlation_id)) <= 160),
  constraint automation_events_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint automation_events_dispatch_status_check check (dispatch_status in ('pending','processing','dispatched','completed','failed')),
  constraint automation_events_dispatch_attempts_check check (dispatch_attempts >= 0),
  constraint automation_events_operation_context_check check (operation_id is not null or event_type in ('lead.created','order.confirmed')),
  constraint automation_events_id_tenant_id_key unique (id, tenant_id),
  constraint automation_events_tenant_id_source_idempotency_key_key unique (tenant_id, source, idempotency_key),
  constraint automation_events_operation_id_tenant_id_fkey foreign key (operation_id, tenant_id) references public.operations(id, tenant_id) on delete set null (operation_id)
);

create table if not exists public.automation_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  automation_event_id uuid not null,
  outcome text not null,
  intent text null,
  urgency text null,
  summary text null,
  suggested_reply text null,
  error_code text null,
  error_message text null,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint automation_results_automation_event_id_key unique (automation_event_id),
  constraint automation_results_automation_event_id_tenant_id_fkey foreign key (automation_event_id, tenant_id) references public.automation_events(id, tenant_id) on delete cascade,
  constraint automation_results_outcome_check check (outcome in ('completed','failed')),
  constraint automation_results_intent_check check (intent is null or intent in ('price','installment','group','ready_to_buy','human_support','other')),
  constraint automation_results_urgency_check check (urgency is null or urgency in ('low','medium','high')),
  constraint automation_results_summary_check check (summary is null or length(summary) <= 500),
  constraint automation_results_suggested_reply_check check (suggested_reply is null or length(suggested_reply) <= 600),
  constraint automation_results_provider_metadata_check check (jsonb_typeof(provider_metadata) = 'object')
);

create index if not exists automation_events_tenant_created_idx on public.automation_events (tenant_id, created_at desc);
create index if not exists automation_events_pending_idx on public.automation_events (dispatch_status, created_at) where dispatch_status in ('pending','failed');
create index if not exists automation_results_tenant_created_idx on public.automation_results (tenant_id, created_at desc);

alter table public.automation_events enable row level security;
alter table public.automation_results enable row level security;

drop policy if exists automation_events_select_member on public.automation_events;
create policy automation_events_select_member on public.automation_events for select to authenticated using (app_private.is_tenant_member(tenant_id));

drop policy if exists automation_results_select_member on public.automation_results;
create policy automation_results_select_member on public.automation_results for select to authenticated using (app_private.is_tenant_member(tenant_id));

revoke all on public.automation_events from anon, authenticated;
revoke all on public.automation_results from anon, authenticated;
grant select on public.automation_events to authenticated;
grant select on public.automation_results to authenticated;
grant all privileges on public.automation_events to service_role;
grant all privileges on public.automation_results to service_role;

drop trigger if exists automation_events_updated_at on public.automation_events;
create trigger automation_events_updated_at before update on public.automation_events for each row execute function public.set_updated_at();

create or replace function app_private.reject_automation_result_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
begin
  raise exception 'automation_results is append-only';
end;
$$;

drop trigger if exists automation_results_immutable on public.automation_results;
create trigger automation_results_immutable before update or delete on public.automation_results for each row execute function app_private.reject_automation_result_mutation();