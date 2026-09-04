create table if not exists public.calendar_sync_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  operation_id uuid not null,
  source_kind text not null check (source_kind in ('event')),
  source_id uuid not null,
  provider text not null default 'google_calendar' check (provider = 'google_calendar'),
  calendar_id text not null,
  external_event_id text,
  sync_status text not null default 'pending' check (sync_status in ('pending','synced','failed')),
  source_version timestamptz not null,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_kind, source_id, provider, calendar_id),
  foreign key (tenant_id, operation_id) references public.operations(tenant_id, id) on delete cascade
);

create index if not exists calendar_sync_links_operation_idx on public.calendar_sync_links(tenant_id, operation_id, sync_status);
alter table public.calendar_sync_links enable row level security;

create policy calendar_sync_links_operator_read on public.calendar_sync_links for select to authenticated using (app_private.has_tenant_role(tenant_id, array['owner','admin','operations_agent']::app_role[]));

create or replace function public.request_google_calendar_event_sync(_event_id uuid, _calendar_id text default 'primary') returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare
  _event public.events%rowtype;
  _link public.calendar_sync_links%rowtype;
  _payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _event from public.events where id = _event_id;
  if not found then raise exception 'Event not found'; end if;
  if not app_private.has_tenant_role(_event.tenant_id, array['owner','admin','operations_agent']::app_role[]) then raise exception 'Not authorized'; end if;
  if nullif(trim(_calendar_id),'') is null then raise exception 'Calendar id required'; end if;

  insert into public.calendar_sync_links(tenant_id,operation_id,source_kind,source_id,calendar_id,sync_status,source_version,last_error,updated_at)
  values (_event.tenant_id,_event.operation_id,'event',_event.id,trim(_calendar_id),'pending',_event.updated_at,null,now())
  on conflict (tenant_id,source_kind,source_id,provider,calendar_id) do update set sync_status='pending',source_version=excluded.source_version,last_error=null,updated_at=now()
  returning * into _link;

  _payload := jsonb_build_object(
    'sync_link_id', _link.id,
    'tenant_id', _event.tenant_id,
    'operation_id', _event.operation_id,
    'source_kind', 'event',
    'source_id', _event.id,
    'calendar_id', trim(_calendar_id),
    'external_event_id', _link.external_event_id,
    'title', _event.name,
    'timezone', coalesce(_event.timezone,'America/Sao_Paulo'),
    'schedule_precision', _event.schedule_precision,
    'planned_start', _event.planned_start,
    'planned_end', _event.planned_end,
    'source_version', _event.updated_at
  );
  return _payload;
end $$;

revoke all on function public.request_google_calendar_event_sync(uuid,text) from public;
grant execute on function public.request_google_calendar_event_sync(uuid,text) to authenticated;

create or replace function public.complete_google_calendar_event_sync(_sync_link_id uuid, _external_event_id text, _source_version timestamptz, _metadata jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare _link public.calendar_sync_links%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if nullif(trim(_external_event_id),'') is null then raise exception 'External event id required'; end if;
  update public.calendar_sync_links set external_event_id=trim(_external_event_id), sync_status='synced', source_version=_source_version, last_synced_at=now(), last_error=null, metadata=coalesce(_metadata,'{}'::jsonb), updated_at=now() where id=_sync_link_id returning * into _link;
  if not found then raise exception 'Sync link not found'; end if;
  return jsonb_build_object('ok',true,'sync_link_id',_link.id,'external_event_id',_link.external_event_id,'sync_status',_link.sync_status);
end $$;

revoke all on function public.complete_google_calendar_event_sync(uuid,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.complete_google_calendar_event_sync(uuid,text,timestamptz,jsonb) to service_role;