create table if not exists public.commercial_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  experience_id uuid null references public.experiences(id) on delete set null,
  operation_id uuid null references public.operations(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null,
  source text not null default 'landing_page',
  campaign text null,
  status text not null default 'new',
  consent_contact boolean not null default false,
  consent_at timestamptz null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_leads_full_name_check check (char_length(btrim(full_name)) between 2 and 120),
  constraint commercial_leads_email_check check (position('@' in email) > 1),
  constraint commercial_leads_phone_check check (char_length(regexp_replace(phone, '\D', '', 'g')) between 10 and 15),
  constraint commercial_leads_status_check check (status in ('new','contacted','qualified','converted','lost','archived')),
  constraint commercial_leads_idempotency_unique unique (tenant_id, idempotency_key)
);

create index if not exists commercial_leads_tenant_created_idx on public.commercial_leads (tenant_id, created_at desc);
create index if not exists commercial_leads_operation_created_idx on public.commercial_leads (operation_id, created_at desc) where operation_id is not null;
create index if not exists commercial_leads_experience_created_idx on public.commercial_leads (experience_id, created_at desc) where experience_id is not null;
create index if not exists commercial_leads_email_idx on public.commercial_leads (tenant_id, lower(email));

alter table public.commercial_leads enable row level security;
revoke all on table public.commercial_leads from anon;
revoke all on table public.commercial_leads from authenticated;
grant select, update on table public.commercial_leads to authenticated;

create policy commercial_leads_staff_select on public.commercial_leads
for select to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.tenant_id = commercial_leads.tenant_id
      and m.profile_id = auth.uid()
      and m.status::text = 'active'
  )
);

create policy commercial_leads_staff_update on public.commercial_leads
for update to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.tenant_id = commercial_leads.tenant_id
      and m.profile_id = auth.uid()
      and m.status::text = 'active'
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.tenant_id = commercial_leads.tenant_id
      and m.profile_id = auth.uid()
      and m.status::text = 'active'
  )
);

create or replace function public.set_commercial_leads_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_commercial_leads_updated_at on public.commercial_leads;
create trigger trg_commercial_leads_updated_at
before update on public.commercial_leads
for each row execute function public.set_commercial_leads_updated_at();