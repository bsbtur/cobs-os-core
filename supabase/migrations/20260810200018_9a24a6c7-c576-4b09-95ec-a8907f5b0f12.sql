-- =========================================================
-- COBS OS · W08 — COMMUNICATION & NOTIFICATION CORE
-- Additive only. W01–W07 untouched.
-- =========================================================

-- ---------- ENUMS (7) ----------
create type public.message_kind as enum
  ('operational','alert','instruction','reminder','update','announcement','other');
create type public.message_priority as enum ('normal','important','urgent');
create type public.message_status as enum ('draft','scheduled','published','cancelled');
create type public.communication_channel as enum ('in_app');
create type public.delivery_status as enum ('delivered');
create type public.audience_selector_kind as enum
  ('all_participations','participation_kind','operation_role_type','explicit_person');
create type public.communication_event_type as enum
  ('MESSAGE_PUBLISHED','IN_APP_DELIVERY_CREATED','MESSAGE_READ');

-- ---------- GUARDS ----------
create or replace function public.guard_w08_mutation()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  if coalesce(current_setting('app.w08_control', true), 'off') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Communication data can only change through the approved commands';
end; $$;
revoke all on function public.guard_w08_mutation() from public, anon, authenticated;

create or replace function public.guard_w08_append_only()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  raise exception '% is append-only', tg_table_name;
end; $$;
revoke all on function public.guard_w08_append_only() from public, anon, authenticated;

-- ---------- TABLE 1: messages ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid,
  kind public.message_kind not null default 'operational',
  priority public.message_priority not null default 'normal',
  status public.message_status not null default 'draft',
  title text not null,
  body text not null,
  locale text not null default 'pt-BR',
  expires_at timestamptz,
  scheduled_for timestamptz,
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancel_reason text,
  supersedes_message_id uuid,
  journey_step_id uuid,
  transport_leg_id uuid,
  hospitality_stay_id uuid,
  event_id uuid,
  event_session_id uuid,
  recipient_count integer not null default 0,
  in_app_reachable_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_tenant_id_id_key unique (tenant_id, id),
  constraint messages_tenant_id_event_id_key unique (tenant_id, event_id, id),
  constraint messages_operation_fk foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id) on delete cascade,
  constraint messages_supersedes_fk foreign key (tenant_id, supersedes_message_id)
    references public.messages(tenant_id, id),
  constraint messages_journey_step_fk foreign key (journey_step_id, tenant_id)
    references public.journey_steps(id, tenant_id),
  constraint messages_transport_leg_fk foreign key (transport_leg_id, tenant_id)
    references public.transport_legs(id, tenant_id),
  constraint messages_stay_fk foreign key (hospitality_stay_id, tenant_id)
    references public.hospitality_stays(id, tenant_id),
  constraint messages_event_fk foreign key (tenant_id, event_id)
    references public.events(tenant_id, id),
  constraint messages_session_fk foreign key (event_id, event_session_id)
    references public.event_sessions(event_id, id),
  constraint messages_title_ck check (length(btrim(title)) between 1 and 160),
  constraint messages_body_ck check (length(btrim(body)) between 1 and 4000),
  constraint messages_locale_ck check (locale in ('pt-BR','en-US','es-ES')),
  constraint messages_source_cardinality_ck check (
    (case when journey_step_id is not null then 1 else 0 end
     + case when transport_leg_id is not null then 1 else 0 end
     + case when hospitality_stay_id is not null then 1 else 0 end
     + case when event_id is not null then 1 else 0 end
     + case when event_session_id is not null then 1 else 0 end) <= 1
    or (event_id is not null and event_session_id is not null
        and journey_step_id is null and transport_leg_id is null and hospitality_stay_id is null)
  ),
  constraint messages_session_requires_event_ck check (event_session_id is null or event_id is not null),
  constraint messages_tenant_scope_source_ck check (
    operation_id is not null
    or (journey_step_id is null and transport_leg_id is null and hospitality_stay_id is null
        and event_id is null and event_session_id is null)
  ),
  constraint messages_published_ck check (
    (status <> 'published') or (published_at is not null and published_by is not null)
  ),
  constraint messages_scheduled_ck check ((status <> 'scheduled') or scheduled_for is not null),
  constraint messages_cancelled_ck check ((status <> 'cancelled') or cancelled_at is not null)
);

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;

create index messages_tenant_status_idx on public.messages (tenant_id, status, created_at desc);
create index messages_operation_idx on public.messages (operation_id, status, published_at desc);
create index messages_scheduled_idx on public.messages (tenant_id, scheduled_for) where status = 'scheduled';

create trigger set_messages_updated_at before update on public.messages
  for each row execute function public.set_updated_at();
create trigger guard_messages_w08 before insert or update or delete on public.messages
  for each row execute function public.guard_w08_mutation();

-- ---------- TABLE 2: message_audience_selectors ----------
create table public.message_audience_selectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid not null,
  selector_kind public.audience_selector_kind not null,
  participation_kind public.participation_kind,
  role_type_id uuid,
  person_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint mas_message_fk foreign key (tenant_id, message_id)
    references public.messages(tenant_id, id) on delete cascade,
  constraint mas_role_type_fk foreign key (role_type_id, tenant_id)
    references public.operation_role_types(id, tenant_id) on delete restrict,
  constraint mas_person_fk foreign key (person_id, tenant_id)
    references public.people(id, tenant_id) on delete restrict,
  constraint mas_shape_ck check (
    case selector_kind
      when 'all_participations' then participation_kind is null and role_type_id is null and person_id is null
      when 'participation_kind' then participation_kind is not null and role_type_id is null and person_id is null
      when 'operation_role_type' then role_type_id is not null and participation_kind is null and person_id is null
      when 'explicit_person' then person_id is not null and participation_kind is null and role_type_id is null
    end
  )
);

revoke all on public.message_audience_selectors from anon, authenticated;
grant select on public.message_audience_selectors to authenticated;
grant all on public.message_audience_selectors to service_role;
alter table public.message_audience_selectors enable row level security;

create unique index mas_all_uq on public.message_audience_selectors (message_id)
  where selector_kind = 'all_participations';
create unique index mas_kind_uq on public.message_audience_selectors (message_id, participation_kind)
  where selector_kind = 'participation_kind';
create unique index mas_role_uq on public.message_audience_selectors (message_id, role_type_id)
  where selector_kind = 'operation_role_type';
create unique index mas_person_uq on public.message_audience_selectors (message_id, person_id)
  where selector_kind = 'explicit_person';
create index mas_message_idx on public.message_audience_selectors (message_id);

create trigger guard_mas_w08 before insert or update or delete on public.message_audience_selectors
  for each row execute function public.guard_w08_mutation();

-- ---------- TABLE 3: message_recipients ----------
create table public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid not null,
  person_id uuid not null,
  in_app_eligible boolean not null default false,
  first_read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_recipients_identity_key unique (tenant_id, id),
  constraint message_recipients_unique unique (message_id, person_id),
  constraint mr_message_fk foreign key (tenant_id, message_id)
    references public.messages(tenant_id, id) on delete cascade,
  constraint mr_person_fk foreign key (person_id, tenant_id)
    references public.people(id, tenant_id) on delete cascade
);

revoke all on public.message_recipients from anon, authenticated;
grant select on public.message_recipients to authenticated;
grant all on public.message_recipients to service_role;
alter table public.message_recipients enable row level security;

create index message_recipients_person_idx on public.message_recipients (tenant_id, person_id, created_at desc);

create trigger guard_message_recipients_w08 before insert or update or delete on public.message_recipients
  for each row execute function public.guard_w08_mutation();

-- ---------- TABLE 4: message_deliveries ----------
create table public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid not null,
  recipient_id uuid not null,
  person_id uuid not null,
  channel public.communication_channel not null default 'in_app',
  status public.delivery_status not null default 'delivered',
  delivered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint message_deliveries_identity_key unique (tenant_id, id),
  constraint message_deliveries_unique unique (message_id, person_id, channel),
  constraint md_message_fk foreign key (tenant_id, message_id)
    references public.messages(tenant_id, id) on delete cascade,
  constraint md_recipient_fk foreign key (tenant_id, recipient_id)
    references public.message_recipients(tenant_id, id) on delete cascade,
  constraint md_person_fk foreign key (person_id, tenant_id)
    references public.people(id, tenant_id) on delete cascade
);

revoke all on public.message_deliveries from anon, authenticated;
grant select on public.message_deliveries to authenticated;
grant all on public.message_deliveries to service_role;
alter table public.message_deliveries enable row level security;

create index message_deliveries_person_idx on public.message_deliveries (tenant_id, person_id, delivered_at desc);

create trigger guard_message_deliveries_w08 before insert on public.message_deliveries
  for each row execute function public.guard_w08_mutation();
create trigger guard_message_deliveries_immutable before update or delete on public.message_deliveries
  for each row execute function public.guard_w08_append_only();

-- ---------- TABLE 5: communication_events ----------
create table public.communication_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid,
  message_id uuid not null,
  event_type public.communication_event_type not null,
  person_id uuid,
  recipient_id uuid,
  delivery_id uuid,
  actor_profile_id uuid references public.profiles(id),
  occurred_at timestamptz not null default now(),
  context jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint ce_message_fk foreign key (tenant_id, message_id)
    references public.messages(tenant_id, id) on delete cascade,
  constraint ce_operation_fk foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id) on delete cascade,
  constraint ce_person_fk foreign key (person_id, tenant_id)
    references public.people(id, tenant_id) on delete cascade,
  constraint ce_recipient_fk foreign key (tenant_id, recipient_id)
    references public.message_recipients(tenant_id, id) on delete cascade,
  constraint ce_delivery_fk foreign key (tenant_id, delivery_id)
    references public.message_deliveries(tenant_id, id) on delete cascade
);

revoke all on public.communication_events from anon, authenticated;
grant select on public.communication_events to authenticated;
grant all on public.communication_events to service_role;
alter table public.communication_events enable row level security;

create unique index communication_events_publication_uq on public.communication_events (message_id)
  where event_type = 'MESSAGE_PUBLISHED';
create unique index communication_events_delivery_uq on public.communication_events (message_id, person_id)
  where event_type = 'IN_APP_DELIVERY_CREATED';
create unique index communication_events_read_uq on public.communication_events (message_id, person_id)
  where event_type = 'MESSAGE_READ';
create index communication_events_message_idx on public.communication_events (message_id, occurred_at desc);
create index communication_events_tenant_idx on public.communication_events (tenant_id, occurred_at desc);

create trigger guard_communication_events_w08 before insert on public.communication_events
  for each row execute function public.guard_w08_mutation();
create trigger guard_communication_events_append_only before update or delete on public.communication_events
  for each row execute function public.guard_w08_append_only();

-- =========================================================
-- PRIVATE HELPERS (14)
-- =========================================================

create or replace function app_private.w08_is_comms_operator(_tenant_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public' as $$
  select app_private.has_tenant_role(_tenant_id,
    array['owner','admin','operations_agent']::public.app_role[])
$$;

create or replace function app_private.w08_require_comms_operator(_tenant_id uuid)
returns void language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.w08_is_comms_operator(_tenant_id) then
    raise exception 'You do not have permission for communication operations in this organization';
  end if;
end; $$;

create or replace function app_private.w08_current_person_id(_tenant_id uuid)
returns uuid language sql stable security definer set search_path to 'pg_catalog','public' as $$
  select p.id from public.people p
  where p.tenant_id = _tenant_id and p.profile_id = auth.uid()
  limit 1
$$;

create or replace function app_private.w08_tenant_of_operation(_operation_id uuid)
returns uuid language sql stable security definer set search_path to 'pg_catalog','public' as $$
  select o.tenant_id from public.operations o where o.id = _operation_id
$$;

create or replace function app_private.w08_assert_draft(_message public.messages)
returns void language plpgsql immutable set search_path to 'pg_catalog','public' as $$
begin
  if _message.status not in ('draft','scheduled') then
    raise exception 'Only a draft or scheduled message can be changed';
  end if;
end; $$;

create or replace function app_private.w08_assert_published(_message public.messages)
returns void language plpgsql immutable set search_path to 'pg_catalog','public' as $$
begin
  if _message.status not in ('published','cancelled') or _message.published_at is null then
    raise exception 'This message has not been published';
  end if;
end; $$;

create or replace function app_private.w08_assert_content_policy(_title text, _body text)
returns void language plpgsql immutable set search_path to 'pg_catalog','public' as $$
declare _t text := lower(coalesce(_title,'') || ' ' || coalesce(_body,''));
begin
  if _t ~ '\m\d{3}\.?\d{3}\.?\d{3}-\d{2}\M' then
    raise exception 'Message content must not contain government identifiers';
  end if;
  if _t ~ '\m\d{3}-\d{2}-\d{4}\M' then
    raise exception 'Message content must not contain government identifiers';
  end if;
  if _t ~ '\m(?:\d[ -]?){15,18}\M' then
    raise exception 'Message content must not contain payment credentials';
  end if;
  if _t ~ '(senha|password|api[ _-]?key|secret[ _-]?key|access[ _-]?token|bearer )\s*[:=]' then
    raise exception 'Message content must not contain credentials or tokens';
  end if;
  if _t ~ '(diagn[oó]stico m[eé]dico|medical diagnosis|prontu[aá]rio m[eé]dico|historial m[eé]dico)' then
    raise exception 'Message content must not contain medical records';
  end if;
end; $$;

create or replace function app_private.w08_assert_source_operation_scope(_message public.messages)
returns void language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare _ok boolean;
begin
  if _message.operation_id is null then
    if _message.journey_step_id is not null or _message.transport_leg_id is not null
       or _message.hospitality_stay_id is not null or _message.event_id is not null
       or _message.event_session_id is not null then
      raise exception 'A tenant-wide message cannot link to operational context';
    end if;
    return;
  end if;

  if _message.journey_step_id is not null then
    select exists (select 1 from public.journey_steps s
      where s.id = _message.journey_step_id and s.tenant_id = _message.tenant_id
        and s.operation_id = _message.operation_id) into _ok;
    if not _ok then raise exception 'The linked journey step belongs to another operation'; end if;
  end if;

  if _message.transport_leg_id is not null then
    select exists (select 1 from public.transport_legs l
      where l.id = _message.transport_leg_id and l.tenant_id = _message.tenant_id
        and l.operation_id = _message.operation_id) into _ok;
    if not _ok then raise exception 'The linked transport leg belongs to another operation'; end if;
  end if;

  if _message.hospitality_stay_id is not null then
    select exists (select 1 from public.hospitality_stays h
      where h.id = _message.hospitality_stay_id and h.tenant_id = _message.tenant_id
        and h.operation_id = _message.operation_id) into _ok;
    if not _ok then raise exception 'The linked stay belongs to another operation'; end if;
  end if;

  if _message.event_id is not null then
    select exists (select 1 from public.events e
      where e.id = _message.event_id and e.tenant_id = _message.tenant_id
        and e.operation_id = _message.operation_id) into _ok;
    if not _ok then raise exception 'The linked event belongs to another operation'; end if;
  end if;

  if _message.event_session_id is not null then
    select exists (select 1 from public.event_sessions s
      where s.id = _message.event_session_id and s.tenant_id = _message.tenant_id
        and s.event_id = _message.event_id) into _ok;
    if not _ok then raise exception 'The linked session belongs to another event'; end if;
  end if;
end; $$;

create or replace function app_private.w08_assert_explicit_people_in_operation(_message public.messages, _person_ids uuid[])
returns void language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare _missing int;
begin
  if _person_ids is null or array_length(_person_ids, 1) is null then return; end if;

  if _message.operation_id is null then
    select count(*) into _missing
    from unnest(_person_ids) as t(pid)
    where not exists (select 1 from public.people p
      where p.id = t.pid and p.tenant_id = _message.tenant_id);
    if _missing > 0 then raise exception 'One or more selected people are not in this organization'; end if;
    return;
  end if;

  select count(*) into _missing
  from unnest(_person_ids) as t(pid)
  where not exists (
    select 1 from public.operation_participations op
    where op.person_id = t.pid
      and op.tenant_id = _message.tenant_id
      and op.operation_id = _message.operation_id
      and op.status <> 'cancelled'
  );
  if _missing > 0 then
    raise exception 'One or more selected people are not active participants of this operation';
  end if;
end; $$;

create or replace function app_private.w08_resolve_audience(_message public.messages)
returns table (person_id uuid)
language sql stable security definer set search_path to 'pg_catalog','public' as $$
  select distinct x.person_id from (
    select op.person_id
    from public.message_audience_selectors s
    join public.operation_participations op
      on op.tenant_id = s.tenant_id and op.operation_id = _message.operation_id
     and op.status <> 'cancelled'
    where s.message_id = _message.id and s.selector_kind = 'all_participations'
      and _message.operation_id is not null

    union
    select op.person_id
    from public.message_audience_selectors s
    join public.operation_participations op
      on op.tenant_id = s.tenant_id and op.operation_id = _message.operation_id
     and op.status <> 'cancelled'
     and op.participation_kind = s.participation_kind
    where s.message_id = _message.id and s.selector_kind = 'participation_kind'
      and _message.operation_id is not null

    union
    select op.person_id
    from public.message_audience_selectors s
    join public.operation_role_assignments ra
      on ra.tenant_id = s.tenant_id and ra.role_type_id = s.role_type_id
    join public.operation_participations op
      on op.id = ra.participation_id and op.tenant_id = ra.tenant_id
     and op.operation_id = _message.operation_id and op.status <> 'cancelled'
    where s.message_id = _message.id and s.selector_kind = 'operation_role_type'
      and _message.operation_id is not null

    union
    select s.person_id
    from public.message_audience_selectors s
    where s.message_id = _message.id and s.selector_kind = 'explicit_person'
  ) x
  where x.person_id is not null
$$;

create or replace function app_private.w08_in_app_eligible_recipients(_tenant_id uuid, _person_ids uuid[])
returns table (person_id uuid)
language sql stable security definer set search_path to 'pg_catalog','public' as $$
  select p.id
  from public.people p
  where p.tenant_id = _tenant_id
    and p.id = any(_person_ids)
    and p.profile_id is not null
    and exists (
      select 1 from public.memberships m
      where m.tenant_id = _tenant_id and m.profile_id = p.profile_id and m.status = 'active'
    )
$$;

create or replace function app_private.w08_record_communication_event(
  _message public.messages,
  _type public.communication_event_type,
  _person_id uuid default null,
  _recipient_id uuid default null,
  _delivery_id uuid default null,
  _context jsonb default '{}'::jsonb,
  _correlation_id text default null
) returns uuid language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _id uuid;
begin
  perform set_config('app.w08_control','on', true);
  insert into public.communication_events
    (tenant_id, operation_id, message_id, event_type, person_id, recipient_id, delivery_id,
     actor_profile_id, occurred_at, context, correlation_id)
  values (_message.tenant_id, _message.operation_id, _message.id, _type, _person_id, _recipient_id,
          _delivery_id, auth.uid(), now(), coalesce(_context,'{}'::jsonb),
          coalesce(nullif(btrim(coalesce(_correlation_id,'')),''), gen_random_uuid()::text))
  returning id into _id;
  perform set_config('app.w08_control','off', true);
  return _id;
end; $$;

create or replace function app_private.w08_create_in_app_deliveries(_message public.messages, _correlation_id text)
returns integer language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _row record; _delivery_id uuid; _count int := 0;
begin
  perform set_config('app.w08_control','on', true);
  for _row in
    select r.id as recipient_id, r.person_id
    from public.message_recipients r
    where r.message_id = _message.id and r.in_app_eligible
    order by r.created_at, r.id
  loop
    insert into public.message_deliveries
      (tenant_id, message_id, recipient_id, person_id, channel, status, delivered_at)
    values (_message.tenant_id, _message.id, _row.recipient_id, _row.person_id,
            'in_app', 'delivered', now())
    returning id into _delivery_id;
    _count := _count + 1;
    perform set_config('app.w08_control','on', true);
    perform app_private.w08_record_communication_event(
      _message, 'IN_APP_DELIVERY_CREATED', _row.person_id, _row.recipient_id, _delivery_id,
      jsonb_build_object('channel','in_app'), _correlation_id);
    perform set_config('app.w08_control','on', true);
  end loop;
  perform set_config('app.w08_control','off', true);
  return _count;
end; $$;

create or replace function app_private.w08_message_delivery_summary(_message_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','public' as $$
  select jsonb_build_object(
    'recipient_count', (select count(*) from public.message_recipients r where r.message_id = _message_id),
    'in_app_reachable_count', (select count(*) from public.message_deliveries d where d.message_id = _message_id),
    'unreachable_count', (select count(*) from public.message_recipients r
                          where r.message_id = _message_id and not r.in_app_eligible),
    'read_count', (select count(*) from public.message_recipients r
                   where r.message_id = _message_id and r.first_read_at is not null)
  )
$$;

revoke all on function app_private.w08_is_comms_operator(uuid) from public, anon, authenticated;
revoke all on function app_private.w08_require_comms_operator(uuid) from public, anon, authenticated;
revoke all on function app_private.w08_current_person_id(uuid) from public, anon, authenticated;
revoke all on function app_private.w08_tenant_of_operation(uuid) from public, anon, authenticated;
revoke all on function app_private.w08_assert_draft(public.messages) from public, anon, authenticated;
revoke all on function app_private.w08_assert_published(public.messages) from public, anon, authenticated;
revoke all on function app_private.w08_assert_content_policy(text, text) from public, anon, authenticated;
revoke all on function app_private.w08_assert_source_operation_scope(public.messages) from public, anon, authenticated;
revoke all on function app_private.w08_assert_explicit_people_in_operation(public.messages, uuid[]) from public, anon, authenticated;
revoke all on function app_private.w08_resolve_audience(public.messages) from public, anon, authenticated;
revoke all on function app_private.w08_in_app_eligible_recipients(uuid, uuid[]) from public, anon, authenticated;
revoke all on function app_private.w08_create_in_app_deliveries(public.messages, text) from public, anon, authenticated;
revoke all on function app_private.w08_record_communication_event(public.messages, public.communication_event_type, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function app_private.w08_message_delivery_summary(uuid) from public, anon, authenticated;

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- messages
create policy "w08 operators read messages" on public.messages
  for select to authenticated
  using (app_private.w08_is_comms_operator(tenant_id));

create policy "w08 recipient self reads addressed messages" on public.messages
  for select to authenticated
  using (
    status in ('published','cancelled')
    and published_at is not null
    and exists (
      select 1 from public.message_recipients r
      where r.message_id = messages.id
        and r.person_id = app_private.w08_current_person_id(messages.tenant_id)
    )
  );

-- selectors: operator only
create policy "w08 operators read audience selectors" on public.message_audience_selectors
  for select to authenticated
  using (app_private.w08_is_comms_operator(tenant_id));

-- recipients
create policy "w08 operators read recipients" on public.message_recipients
  for select to authenticated
  using (app_private.w08_is_comms_operator(tenant_id));

create policy "w08 recipient self reads own recipient row" on public.message_recipients
  for select to authenticated
  using (person_id = app_private.w08_current_person_id(tenant_id));

-- deliveries
create policy "w08 operators read deliveries" on public.message_deliveries
  for select to authenticated
  using (app_private.w08_is_comms_operator(tenant_id));

create policy "w08 recipient self reads own delivery" on public.message_deliveries
  for select to authenticated
  using (person_id = app_private.w08_current_person_id(tenant_id));

-- communication events
create policy "w08 operators read communication events" on public.communication_events
  for select to authenticated
  using (app_private.w08_is_comms_operator(tenant_id));

create policy "w08 recipient self reads own communication events" on public.communication_events
  for select to authenticated
  using (
    person_id = app_private.w08_current_person_id(tenant_id)
    or (
      event_type = 'MESSAGE_PUBLISHED'
      and exists (
        select 1 from public.message_recipients r
        where r.message_id = communication_events.message_id
          and r.person_id = app_private.w08_current_person_id(communication_events.tenant_id)
      )
    )
  );

-- =========================================================
-- PUBLIC COMMANDS (12 mutating)
-- =========================================================

create or replace function public.create_message(
  _tenant_id uuid,
  _title text,
  _body text,
  _kind public.message_kind default 'operational',
  _priority public.message_priority default 'normal',
  _locale text default 'pt-BR',
  _operation_id uuid default null,
  _journey_step_id uuid default null,
  _transport_leg_id uuid default null,
  _hospitality_stay_id uuid default null,
  _event_id uuid default null,
  _event_session_id uuid default null,
  _expires_at timestamptz default null,
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages; _prev jsonb; _result jsonb;
begin
  perform app_private.w08_require_comms_operator(_tenant_id);
  perform app_private.w08_assert_content_policy(_title, _body);

  if _operation_id is not null
     and app_private.w08_tenant_of_operation(_operation_id) is distinct from _tenant_id then
    raise exception 'Operation not found in this organization';
  end if;

  if _idempotency_key is not null then
    begin
      insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
      values (_tenant_id, auth.uid(), 'w08.create_message', _idempotency_key, '{}'::jsonb);
    exception when unique_violation then
      select result into _prev from public.idempotency_keys
      where actor_profile_id = auth.uid() and action = 'w08.create_message'
        and idempotency_key = _idempotency_key;
      return coalesce(_prev,'{}'::jsonb) || jsonb_build_object('replayed', true);
    end;
  end if;

  perform set_config('app.w08_control','on', true);
  insert into public.messages
    (tenant_id, operation_id, kind, priority, status, title, body, locale, expires_at,
     journey_step_id, transport_leg_id, hospitality_stay_id, event_id, event_session_id, created_by)
  values (_tenant_id, _operation_id, _kind, _priority, 'draft', btrim(_title), btrim(_body),
          _locale, _expires_at, _journey_step_id, _transport_leg_id, _hospitality_stay_id,
          _event_id, _event_session_id, auth.uid())
  returning * into _msg;
  perform set_config('app.w08_control','off', true);

  perform app_private.w08_assert_source_operation_scope(_msg);

  perform app_private.record_audit_event(_tenant_id, auth.uid(), 'w08.message_created',
    'message', _msg.id, _idempotency_key,
    jsonb_build_object('kind', _kind, 'priority', _priority, 'operation_id', _operation_id));

  _result := jsonb_build_object('message_id', _msg.id, 'status', 'draft', 'replayed', false);
  if _idempotency_key is not null then
    update public.idempotency_keys set result = _result
    where actor_profile_id = auth.uid() and action = 'w08.create_message'
      and idempotency_key = _idempotency_key;
  end if;
  return _result;
end; $$;

create or replace function public.update_draft_message(
  _message_id uuid,
  _title text default null,
  _body text default null,
  _kind public.message_kind default null,
  _priority public.message_priority default null,
  _locale text default null,
  _expires_at timestamptz default null,
  _clear_expiry boolean default false,
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);
  perform app_private.w08_assert_draft(_msg);
  perform app_private.w08_assert_content_policy(coalesce(_title,_msg.title), coalesce(_body,_msg.body));

  perform set_config('app.w08_control','on', true);
  update public.messages set
    title = coalesce(nullif(btrim(coalesce(_title,'')),''), title),
    body = coalesce(nullif(btrim(coalesce(_body,'')),''), body),
    kind = coalesce(_kind, kind),
    priority = coalesce(_priority, priority),
    locale = coalesce(_locale, locale),
    expires_at = case when _clear_expiry then null else coalesce(_expires_at, expires_at) end
  where id = _message_id
  returning * into _msg;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.draft_updated',
    'message', _msg.id, _idempotency_key, '{}'::jsonb);

  return jsonb_build_object('message_id', _msg.id, 'status', _msg.status, 'unchanged', false);
end; $$;

create or replace function public.delete_draft_message(
  _message_id uuid,
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages; _tenant uuid;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then return jsonb_build_object('deleted', false, 'unchanged', true); end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);

  if _msg.status = 'published' or _msg.published_at is not null then
    raise exception 'A published message can never be deleted';
  end if;
  if exists (select 1 from public.message_recipients r where r.message_id = _message_id)
     or exists (select 1 from public.message_deliveries d where d.message_id = _message_id)
     or exists (select 1 from public.communication_events e where e.message_id = _message_id) then
    raise exception 'This message already has communication history and cannot be deleted';
  end if;

  _tenant := _msg.tenant_id;
  perform set_config('app.w08_control','on', true);
  delete from public.message_audience_selectors where message_id = _message_id;
  delete from public.messages where id = _message_id;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_tenant, auth.uid(), 'w08.draft_deleted',
    'message', _message_id, _idempotency_key, '{}'::jsonb);
  return jsonb_build_object('deleted', true, 'unchanged', false);
end; $$;

create or replace function public.set_message_audience(
  _message_id uuid,
  _all_participations boolean default false,
  _participation_kinds public.participation_kind[] default null,
  _role_type_ids uuid[] default null,
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages; _k public.participation_kind; _r uuid;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);
  perform app_private.w08_assert_draft(_msg);

  if _msg.operation_id is null
     and (_all_participations
          or coalesce(array_length(_participation_kinds,1),0) > 0
          or coalesce(array_length(_role_type_ids,1),0) > 0) then
    raise exception 'Roster-based targeting requires an operation-scoped message';
  end if;

  perform set_config('app.w08_control','on', true);
  delete from public.message_audience_selectors
  where message_id = _message_id and selector_kind <> 'explicit_person';

  if _all_participations then
    insert into public.message_audience_selectors
      (tenant_id, message_id, selector_kind, created_by)
    values (_msg.tenant_id, _message_id, 'all_participations', auth.uid());
  end if;

  if _participation_kinds is not null then
    foreach _k in array _participation_kinds loop
      insert into public.message_audience_selectors
        (tenant_id, message_id, selector_kind, participation_kind, created_by)
      values (_msg.tenant_id, _message_id, 'participation_kind', _k, auth.uid())
      on conflict do nothing;
    end loop;
  end if;

  if _role_type_ids is not null then
    foreach _r in array _role_type_ids loop
      insert into public.message_audience_selectors
        (tenant_id, message_id, selector_kind, role_type_id, created_by)
      values (_msg.tenant_id, _message_id, 'operation_role_type', _r, auth.uid())
      on conflict do nothing;
    end loop;
  end if;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.audience_set',
    'message', _message_id, _idempotency_key,
    jsonb_build_object('all_participations', _all_participations));

  return jsonb_build_object('message_id', _message_id,
    'selector_count', (select count(*) from public.message_audience_selectors where message_id = _message_id));
end; $$;

create or replace function public.add_message_audience_people(
  _message_id uuid,
  _person_ids uuid[],
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages; _p uuid; _added int := 0;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);
  perform app_private.w08_assert_draft(_msg);
  perform app_private.w08_assert_explicit_people_in_operation(_msg, _person_ids);

  perform set_config('app.w08_control','on', true);
  foreach _p in array coalesce(_person_ids, array[]::uuid[]) loop
    insert into public.message_audience_selectors
      (tenant_id, message_id, selector_kind, person_id, created_by)
    values (_msg.tenant_id, _message_id, 'explicit_person', _p, auth.uid())
    on conflict do nothing;
    _added := _added + 1;
  end loop;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.audience_people_added',
    'message', _message_id, _idempotency_key,
    jsonb_build_object('requested', coalesce(array_length(_person_ids,1),0)));

  return jsonb_build_object('message_id', _message_id, 'requested', coalesce(array_length(_person_ids,1),0),
    'selector_count', (select count(*) from public.message_audience_selectors where message_id = _message_id));
end; $$;

create or replace function public.remove_message_audience_selector(
  _selector_id uuid,
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages; _sel public.message_audience_selectors;
begin
  select * into _sel from public.message_audience_selectors where id = _selector_id;
  if _sel.id is null then return jsonb_build_object('removed', false, 'unchanged', true); end if;
  select * into _msg from public.messages where id = _sel.message_id for update;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);
  perform app_private.w08_assert_draft(_msg);

  perform set_config('app.w08_control','on', true);
  delete from public.message_audience_selectors where id = _selector_id;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.audience_selector_removed',
    'message', _msg.id, _idempotency_key, jsonb_build_object('selector_kind', _sel.selector_kind));
  return jsonb_build_object('removed', true, 'unchanged', false);
end; $$;

create or replace function public.schedule_message(
  _message_id uuid,
  _scheduled_for timestamptz,
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);
  perform app_private.w08_assert_draft(_msg);
  if _scheduled_for is null then raise exception 'A scheduled time is required'; end if;

  if _msg.status = 'scheduled' and _msg.scheduled_for = _scheduled_for then
    return jsonb_build_object('message_id', _message_id, 'status', 'scheduled', 'unchanged', true);
  end if;

  perform set_config('app.w08_control','on', true);
  update public.messages set status = 'scheduled', scheduled_for = _scheduled_for where id = _message_id;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.message_scheduled',
    'message', _message_id, _idempotency_key, jsonb_build_object('scheduled_for', _scheduled_for));
  return jsonb_build_object('message_id', _message_id, 'status', 'scheduled', 'unchanged', false);
end; $$;

create or replace function public.unschedule_message(
  _message_id uuid,
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);
  if _msg.status = 'draft' then
    return jsonb_build_object('message_id', _message_id, 'status', 'draft', 'unchanged', true);
  end if;
  perform app_private.w08_assert_draft(_msg);

  perform set_config('app.w08_control','on', true);
  update public.messages set status = 'draft', scheduled_for = null where id = _message_id;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.message_unscheduled',
    'message', _message_id, _idempotency_key, '{}'::jsonb);
  return jsonb_build_object('message_id', _message_id, 'status', 'draft', 'unchanged', false);
end; $$;

create or replace function public.publish_message(
  _message_id uuid,
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare
  _msg public.messages;
  _prev jsonb;
  _correlation text := gen_random_uuid()::text;
  _people uuid[];
  _eligible uuid[];
  _recipients int := 0;
  _delivered int := 0;
  _result jsonb;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);

  if _msg.status = 'published' then
    return jsonb_build_object('message_id', _message_id, 'status', 'published',
      'unchanged', true,
      'summary', app_private.w08_message_delivery_summary(_message_id));
  end if;
  if _msg.status = 'cancelled' then raise exception 'A cancelled message cannot be published'; end if;

  perform app_private.w08_assert_content_policy(_msg.title, _msg.body);
  perform app_private.w08_assert_source_operation_scope(_msg);

  select coalesce(array_agg(person_id), array[]::uuid[]) into _people
  from app_private.w08_resolve_audience(_msg);

  if coalesce(array_length(_people,1),0) = 0 then
    raise exception 'This message has no resolved audience';
  end if;

  perform app_private.w08_assert_explicit_people_in_operation(_msg,
    (select coalesce(array_agg(s.person_id), array[]::uuid[])
     from public.message_audience_selectors s
     where s.message_id = _message_id and s.selector_kind = 'explicit_person'));

  if _idempotency_key is not null then
    begin
      insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
      values (_msg.tenant_id, auth.uid(), 'w08.publish_message', _idempotency_key, '{}'::jsonb);
    exception when unique_violation then
      select result into _prev from public.idempotency_keys
      where actor_profile_id = auth.uid() and action = 'w08.publish_message'
        and idempotency_key = _idempotency_key;
      return coalesce(_prev,'{}'::jsonb) || jsonb_build_object('replayed', true);
    end;
  end if;

  select coalesce(array_agg(person_id), array[]::uuid[]) into _eligible
  from app_private.w08_in_app_eligible_recipients(_msg.tenant_id, _people);

  perform set_config('app.w08_control','on', true);
  insert into public.message_recipients (tenant_id, message_id, person_id, in_app_eligible)
  select _msg.tenant_id, _msg.id, p, p = any(_eligible)
  from unnest(_people) as t(p);
  get diagnostics _recipients = row_count;
  perform set_config('app.w08_control','off', true);

  perform app_private.w08_record_communication_event(
    _msg, 'MESSAGE_PUBLISHED', null, null, null,
    jsonb_build_object('recipient_count', _recipients), _correlation);

  _delivered := app_private.w08_create_in_app_deliveries(_msg, _correlation);

  perform set_config('app.w08_control','on', true);
  update public.messages set
    status = 'published',
    published_at = now(),
    published_by = auth.uid(),
    recipient_count = _recipients,
    in_app_reachable_count = _delivered
  where id = _message_id
  returning * into _msg;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.message_published',
    'message', _message_id, coalesce(_idempotency_key, _correlation),
    jsonb_build_object('recipient_count', _recipients, 'in_app_reachable_count', _delivered));

  _result := jsonb_build_object('message_id', _message_id, 'status', 'published', 'unchanged', false,
    'summary', app_private.w08_message_delivery_summary(_message_id));

  if _idempotency_key is not null then
    update public.idempotency_keys set result = _result
    where actor_profile_id = auth.uid() and action = 'w08.publish_message'
      and idempotency_key = _idempotency_key;
  end if;
  return _result;
end; $$;

create or replace function public.cancel_message(
  _message_id uuid,
  _reason text default null,
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages;
begin
  select * into _msg from public.messages where id = _message_id for update;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);

  if _msg.status = 'cancelled' then
    return jsonb_build_object('message_id', _message_id, 'status', 'cancelled', 'unchanged', true);
  end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then
    raise exception 'A cancellation reason is required';
  end if;
  perform app_private.assert_generic_note(btrim(_reason));

  perform set_config('app.w08_control','on', true);
  update public.messages set
    status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancel_reason = btrim(_reason)
  where id = _message_id;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_msg.tenant_id, auth.uid(), 'w08.message_cancelled',
    'message', _message_id, _idempotency_key, jsonb_build_object('was_published', _msg.published_at is not null));
  return jsonb_build_object('message_id', _message_id, 'status', 'cancelled', 'unchanged', false);
end; $$;

create or replace function public.create_correction_message(
  _message_id uuid,
  _title text default null,
  _body text default null,
  _idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _src public.messages; _new public.messages; _prev jsonb; _result jsonb;
begin
  select * into _src from public.messages where id = _message_id;
  if _src.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_src.tenant_id);
  perform app_private.w08_assert_published(_src);
  perform app_private.w08_assert_content_policy(coalesce(_title,_src.title), coalesce(_body,_src.body));

  if _idempotency_key is not null then
    begin
      insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
      values (_src.tenant_id, auth.uid(), 'w08.create_correction_message', _idempotency_key, '{}'::jsonb);
    exception when unique_violation then
      select result into _prev from public.idempotency_keys
      where actor_profile_id = auth.uid() and action = 'w08.create_correction_message'
        and idempotency_key = _idempotency_key;
      return coalesce(_prev,'{}'::jsonb) || jsonb_build_object('replayed', true);
    end;
  end if;

  perform set_config('app.w08_control','on', true);
  insert into public.messages
    (tenant_id, operation_id, kind, priority, status, title, body, locale, expires_at,
     journey_step_id, transport_leg_id, hospitality_stay_id, event_id, event_session_id,
     supersedes_message_id, created_by)
  values (_src.tenant_id, _src.operation_id, _src.kind, _src.priority, 'draft',
          btrim(coalesce(_title, _src.title)), btrim(coalesce(_body, _src.body)),
          _src.locale, _src.expires_at, _src.journey_step_id, _src.transport_leg_id,
          _src.hospitality_stay_id, _src.event_id, _src.event_session_id, _src.id, auth.uid())
  returning * into _new;

  insert into public.message_audience_selectors
    (tenant_id, message_id, selector_kind, participation_kind, role_type_id, person_id, created_by)
  select _src.tenant_id, _new.id, s.selector_kind, s.participation_kind, s.role_type_id, s.person_id, auth.uid()
  from public.message_audience_selectors s where s.message_id = _src.id;
  perform set_config('app.w08_control','off', true);

  perform app_private.record_audit_event(_src.tenant_id, auth.uid(), 'w08.correction_created',
    'message', _new.id, _idempotency_key, jsonb_build_object('supersedes_message_id', _src.id));

  _result := jsonb_build_object('message_id', _new.id, 'supersedes_message_id', _src.id,
    'status', 'draft', 'replayed', false);
  if _idempotency_key is not null then
    update public.idempotency_keys set result = _result
    where actor_profile_id = auth.uid() and action = 'w08.create_correction_message'
      and idempotency_key = _idempotency_key;
  end if;
  return _result;
end; $$;

create or replace function public.mark_message_read(_message_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages; _person uuid; _rec public.message_recipients;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _msg from public.messages where id = _message_id;
  if _msg.id is null then raise exception 'Message not found'; end if;
  if _msg.published_at is null then raise exception 'This message has not been published'; end if;

  _person := app_private.w08_current_person_id(_msg.tenant_id);
  if _person is null then raise exception 'You are not addressed by this message'; end if;

  select * into _rec from public.message_recipients
  where message_id = _message_id and person_id = _person for update;
  if _rec.id is null then raise exception 'You are not addressed by this message'; end if;

  if _rec.first_read_at is not null then
    return jsonb_build_object('message_id', _message_id, 'unchanged', true,
      'first_read_at', _rec.first_read_at);
  end if;

  perform set_config('app.w08_control','on', true);
  update public.message_recipients set first_read_at = now() where id = _rec.id returning * into _rec;
  perform set_config('app.w08_control','off', true);

  perform app_private.w08_record_communication_event(
    _msg, 'MESSAGE_READ', _person, _rec.id, null, '{}'::jsonb, null);

  return jsonb_build_object('message_id', _message_id, 'unchanged', false,
    'first_read_at', _rec.first_read_at);
end; $$;

-- =========================================================
-- PUBLIC READS (4)
-- =========================================================

create or replace function public.preview_audience_count(_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages; _people uuid[]; _eligible int;
begin
  select * into _msg from public.messages where id = _message_id;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);

  if _msg.published_at is not null then
    return app_private.w08_message_delivery_summary(_message_id) || jsonb_build_object('source','snapshot');
  end if;

  select coalesce(array_agg(person_id), array[]::uuid[]) into _people
  from app_private.w08_resolve_audience(_msg);
  select count(*) into _eligible
  from app_private.w08_in_app_eligible_recipients(_msg.tenant_id, _people);

  return jsonb_build_object(
    'source','preview',
    'recipient_count', coalesce(array_length(_people,1),0),
    'in_app_reachable_count', _eligible,
    'unreachable_count', coalesce(array_length(_people,1),0) - _eligible,
    'read_count', 0);
end; $$;

create or replace function public.get_operation_communication_feed(
  _operation_id uuid,
  _limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare _tenant uuid; _rows jsonb;
begin
  _tenant := app_private.w08_tenant_of_operation(_operation_id);
  if _tenant is null then raise exception 'Operation not found'; end if;
  perform app_private.w08_require_comms_operator(_tenant);

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into _rows
  from (
    select jsonb_build_object(
      'id', m.id, 'kind', m.kind, 'priority', m.priority, 'status', m.status,
      'title', m.title, 'body', m.body, 'locale', m.locale,
      'expires_at', m.expires_at, 'scheduled_for', m.scheduled_for,
      'published_at', m.published_at, 'published_by', m.published_by,
      'cancelled_at', m.cancelled_at, 'cancel_reason', m.cancel_reason,
      'supersedes_message_id', m.supersedes_message_id,
      'journey_step_id', m.journey_step_id, 'transport_leg_id', m.transport_leg_id,
      'hospitality_stay_id', m.hospitality_stay_id, 'event_id', m.event_id,
      'event_session_id', m.event_session_id,
      'created_at', m.created_at,
      'summary', app_private.w08_message_delivery_summary(m.id)
    ) as x
    from public.messages m
    where m.operation_id = _operation_id
    order by m.created_at desc
    limit greatest(1, least(coalesce(_limit,100), 300))
  ) s;

  return jsonb_build_object('operation_id', _operation_id, 'messages', _rows);
end; $$;

create or replace function public.get_message_recipient_state(_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare _msg public.messages; _rows jsonb;
begin
  select * into _msg from public.messages where id = _message_id;
  if _msg.id is null then raise exception 'Message not found'; end if;
  perform app_private.w08_require_comms_operator(_msg.tenant_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'recipient_id', r.id,
    'person_id', r.person_id,
    'full_name', p.full_name,
    'in_app_eligible', r.in_app_eligible,
    'delivered_at', d.delivered_at,
    'first_read_at', r.first_read_at
  ) order by p.full_name), '[]'::jsonb) into _rows
  from public.message_recipients r
  join public.people p on p.id = r.person_id and p.tenant_id = r.tenant_id
  left join public.message_deliveries d on d.message_id = r.message_id and d.person_id = r.person_id
  where r.message_id = _message_id;

  return jsonb_build_object('message_id', _message_id,
    'summary', app_private.w08_message_delivery_summary(_message_id),
    'recipients', _rows);
end; $$;

create or replace function public.get_my_message_inbox(
  _tenant_id uuid,
  _limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public' as $$
declare _person uuid; _rows jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  _person := app_private.w08_current_person_id(_tenant_id);
  if _person is null then
    return jsonb_build_object('person_id', null, 'messages', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'kind', m.kind, 'priority', m.priority, 'status', m.status,
    'title', m.title, 'body', m.body, 'locale', m.locale,
    'operation_id', m.operation_id,
    'expires_at', m.expires_at,
    'published_at', m.published_at,
    'cancelled_at', m.cancelled_at,
    'delivered_at', d.delivered_at,
    'first_read_at', r.first_read_at
  ) order by m.published_at desc), '[]'::jsonb) into _rows
  from public.message_recipients r
  join public.messages m on m.id = r.message_id
  left join public.message_deliveries d on d.message_id = r.message_id and d.person_id = r.person_id
  where r.tenant_id = _tenant_id
    and r.person_id = _person
    and m.published_at is not null;

  return jsonb_build_object('person_id', _person, 'messages', _rows);
end; $$;

-- =========================================================
-- FUNCTION ACLs
-- =========================================================
revoke all on function public.create_message(uuid, text, text, public.message_kind, public.message_priority, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.create_message(uuid, text, text, public.message_kind, public.message_priority, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text) to authenticated;

revoke all on function public.update_draft_message(uuid, text, text, public.message_kind, public.message_priority, text, timestamptz, boolean, text) from public, anon;
grant execute on function public.update_draft_message(uuid, text, text, public.message_kind, public.message_priority, text, timestamptz, boolean, text) to authenticated;

revoke all on function public.delete_draft_message(uuid, text) from public, anon;
grant execute on function public.delete_draft_message(uuid, text) to authenticated;

revoke all on function public.set_message_audience(uuid, boolean, public.participation_kind[], uuid[], text) from public, anon;
grant execute on function public.set_message_audience(uuid, boolean, public.participation_kind[], uuid[], text) to authenticated;

revoke all on function public.add_message_audience_people(uuid, uuid[], text) from public, anon;
grant execute on function public.add_message_audience_people(uuid, uuid[], text) to authenticated;

revoke all on function public.remove_message_audience_selector(uuid, text) from public, anon;
grant execute on function public.remove_message_audience_selector(uuid, text) to authenticated;

revoke all on function public.schedule_message(uuid, timestamptz, text) from public, anon;
grant execute on function public.schedule_message(uuid, timestamptz, text) to authenticated;

revoke all on function public.unschedule_message(uuid, text) from public, anon;
grant execute on function public.unschedule_message(uuid, text) to authenticated;

revoke all on function public.publish_message(uuid, text) from public, anon;
grant execute on function public.publish_message(uuid, text) to authenticated;

revoke all on function public.cancel_message(uuid, text, text) from public, anon;
grant execute on function public.cancel_message(uuid, text, text) to authenticated;

revoke all on function public.create_correction_message(uuid, text, text, text) from public, anon;
grant execute on function public.create_correction_message(uuid, text, text, text) to authenticated;

revoke all on function public.mark_message_read(uuid) from public, anon;
grant execute on function public.mark_message_read(uuid) to authenticated;

revoke all on function public.preview_audience_count(uuid) from public, anon;
grant execute on function public.preview_audience_count(uuid) to authenticated;

revoke all on function public.get_operation_communication_feed(uuid, integer) from public, anon;
grant execute on function public.get_operation_communication_feed(uuid, integer) to authenticated;

revoke all on function public.get_message_recipient_state(uuid) from public, anon;
grant execute on function public.get_message_recipient_state(uuid) to authenticated;

revoke all on function public.get_my_message_inbox(uuid, integer) from public, anon;
grant execute on function public.get_my_message_inbox(uuid, integer) to authenticated;

-- =========================================================
-- REALTIME (exactly 1 table)
-- =========================================================
alter publication supabase_realtime add table public.communication_events;
