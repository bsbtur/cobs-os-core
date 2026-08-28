-- COBS Calendar & Availability V1: credentials remain in the private schema.
create table app_private.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  google_calendar_id text not null,
  google_calendar_label text,
  google_timezone text,
  access_token text not null,
  refresh_token text,
  access_token_expires_at timestamptz not null,
  granted_scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, profile_id)
);

revoke all on app_private.google_calendar_connections from public, anon, authenticated;
grant all on app_private.google_calendar_connections to service_role;

comment on table app_private.google_calendar_connections is
  'Server-only Google Calendar OAuth connections. Tokens must never be exposed through the Data API.';
