-- Fix Google Calendar V1 persistence through the exposed public API surface while keeping tokens private.
-- app_private is intentionally not exposed by PostgREST, so writes happen through a service-role-only RPC.

create or replace function public.persist_google_calendar_connection(
  _tenant_id uuid,
  _profile_id uuid,
  _google_calendar_id text,
  _google_calendar_label text,
  _google_timezone text,
  _access_token text,
  _refresh_token text,
  _access_token_expires_at timestamptz,
  _granted_scopes text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into app_private.google_calendar_connections (
    tenant_id,
    profile_id,
    google_calendar_id,
    google_calendar_label,
    google_timezone,
    access_token,
    refresh_token,
    access_token_expires_at,
    granted_scopes,
    revoked_at,
    updated_at
  )
  values (
    _tenant_id,
    _profile_id,
    _google_calendar_id,
    _google_calendar_label,
    _google_timezone,
    _access_token,
    _refresh_token,
    _access_token_expires_at,
    coalesce(_granted_scopes, '{}'::text[]),
    null,
    now()
  )
  on conflict (tenant_id, profile_id) do update
  set google_calendar_id = excluded.google_calendar_id,
      google_calendar_label = excluded.google_calendar_label,
      google_timezone = excluded.google_timezone,
      access_token = excluded.access_token,
      refresh_token = coalesce(excluded.refresh_token, app_private.google_calendar_connections.refresh_token),
      access_token_expires_at = excluded.access_token_expires_at,
      granted_scopes = excluded.granted_scopes,
      revoked_at = null,
      updated_at = now();
end;
$$;

revoke all on function public.persist_google_calendar_connection(
  uuid, uuid, text, text, text, text, text, timestamptz, text[]
) from public, anon, authenticated;
grant execute on function public.persist_google_calendar_connection(
  uuid, uuid, text, text, text, text, text, timestamptz, text[]
) to service_role;

create or replace function public.get_my_google_calendar_connection_status(_tenant_id uuid)
returns table (
  google_calendar_label text,
  google_timezone text,
  connected_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select
    c.google_calendar_label,
    c.google_timezone,
    c.connected_at,
    c.updated_at
  from app_private.google_calendar_connections c
  where c.tenant_id = _tenant_id
    and c.profile_id = auth.uid()
    and c.revoked_at is null
    and exists (
      select 1
      from public.memberships m
      where m.tenant_id = _tenant_id
        and m.profile_id = auth.uid()
        and m.status = 'active'
    )
  limit 1;
$$;

revoke all on function public.get_my_google_calendar_connection_status(uuid) from public, anon;
grant execute on function public.get_my_google_calendar_connection_status(uuid) to authenticated;
