create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null default 'app' check (channel in ('app','web','internal')),
  locale text not null default 'pt-BR' check (length(locale) between 2 and 20),
  status text not null default 'open' check (status in ('open','closed')),
  human_available boolean not null default false,
  title text null check (title is null or length(title) <= 160),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  last_message_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_conversations_id_tenant_key unique (id, tenant_id),
  constraint assistant_conversations_operation_tenant_fkey
    foreign key (operation_id, tenant_id) references public.operations(id, tenant_id) on delete set null (operation_id)
);

create index if not exists assistant_conversations_profile_idx
  on public.assistant_conversations(profile_id, updated_at desc);
create index if not exists assistant_conversations_tenant_operation_idx
  on public.assistant_conversations(tenant_id, operation_id, updated_at desc);

create table if not exists public.assistant_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null check (role in ('user','assistant','human','system')),
  content text not null check (length(btrim(content)) between 1 and 4000),
  automation_event_id uuid null references public.automation_events(id) on delete set null,
  automation_result_id uuid null references public.automation_results(id) on delete set null,
  status text not null default 'completed' check (status in ('pending','completed','failed')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint assistant_conversation_messages_conversation_tenant_fkey
    foreign key (conversation_id, tenant_id) references public.assistant_conversations(id, tenant_id) on delete cascade
);

create unique index if not exists assistant_conversation_messages_result_uidx
  on public.assistant_conversation_messages(automation_result_id)
  where automation_result_id is not null;
create unique index if not exists assistant_conversation_messages_event_role_uidx
  on public.assistant_conversation_messages(automation_event_id, role)
  where automation_event_id is not null;
create index if not exists assistant_conversation_messages_conv_idx
  on public.assistant_conversation_messages(conversation_id, created_at asc);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_conversation_messages enable row level security;

create or replace function app_private.assistant_has_operation_access(_tenant_id uuid, _operation_id uuid, _profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    app_private.is_tenant_member(_tenant_id)
    or exists (
      select 1
      from public.participant_access_grants g
      where g.tenant_id = _tenant_id
        and g.operation_id = _operation_id
        and g.profile_id = _profile_id
        and g.status::text = 'active'
        and g.revoked_at is null
    );
$$;

create or replace function app_private.assistant_can_access_conversation(_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.assistant_conversations c
    where c.id = _conversation_id
      and (
        c.profile_id = auth.uid()
        or app_private.has_tenant_role(c.tenant_id, array['owner'::public.app_role,'admin'::public.app_role,'operations_agent'::public.app_role])
      )
  );
$$;

revoke all on function app_private.assistant_has_operation_access(uuid,uuid,uuid) from public;
revoke all on function app_private.assistant_can_access_conversation(uuid) from public;
grant execute on function app_private.assistant_has_operation_access(uuid,uuid,uuid) to authenticated;
grant execute on function app_private.assistant_can_access_conversation(uuid) to authenticated;

drop policy if exists "assistant own conversations read" on public.assistant_conversations;
create policy "assistant own conversations read"
on public.assistant_conversations for select to authenticated
using (
  profile_id = auth.uid()
  or app_private.has_tenant_role(tenant_id, array['owner'::public.app_role,'admin'::public.app_role,'operations_agent'::public.app_role])
);

drop policy if exists "assistant own messages read" on public.assistant_conversation_messages;
create policy "assistant own messages read"
on public.assistant_conversation_messages for select to authenticated
using (app_private.assistant_can_access_conversation(conversation_id));

create or replace function public.assistant_create_conversation(
  _tenant_id uuid,
  _operation_id uuid,
  _channel text default 'app',
  _locale text default 'pt-BR',
  _title text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _profile_id uuid := auth.uid();
  _id uuid;
begin
  if _profile_id is null then raise exception 'not_authenticated'; end if;
  if _operation_id is null then raise exception 'operation_required'; end if;
  if not app_private.assistant_has_operation_access(_tenant_id, _operation_id, _profile_id) then
    raise exception 'assistant_access_denied';
  end if;
  if _channel not in ('app','web','internal') then raise exception 'invalid_channel'; end if;
  if _locale is null or length(_locale) not between 2 and 20 then raise exception 'invalid_locale'; end if;

  insert into public.assistant_conversations(
    tenant_id, operation_id, profile_id, channel, locale, title, last_message_at
  ) values (
    _tenant_id, _operation_id, _profile_id, _channel, _locale, nullif(btrim(_title),''), now()
  ) returning id into _id;

  return _id;
end;
$$;

revoke all on function public.assistant_create_conversation(uuid,uuid,text,text,text) from public;
grant execute on function public.assistant_create_conversation(uuid,uuid,text,text,text) to authenticated;

create or replace function public.assistant_submit_message(
  _conversation_id uuid,
  _message text,
  _human_available boolean default false,
  _idempotency_key text default null
)
returns table(message_id uuid, automation_event_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _c public.assistant_conversations%rowtype;
  _message_id uuid;
  _event_id uuid;
  _idem text;
  _operation_name text;
  _person_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if _message is null or length(btrim(_message)) < 1 or length(_message) > 2000 then
    raise exception 'invalid_message';
  end if;

  select * into _c
  from public.assistant_conversations
  where id = _conversation_id;

  if _c.id is null then raise exception 'conversation_not_found'; end if;
  if not app_private.assistant_can_access_conversation(_conversation_id) then raise exception 'assistant_access_denied'; end if;
  if _c.status <> 'open' then raise exception 'conversation_closed'; end if;

  select o.name into _operation_name from public.operations o where o.id = _c.operation_id and o.tenant_id = _c.tenant_id;
  select g.person_id into _person_id
  from public.participant_access_grants g
  where g.tenant_id = _c.tenant_id and g.operation_id = _c.operation_id and g.profile_id = _c.profile_id
    and g.status::text = 'active' and g.revoked_at is null
  order by g.activated_at desc limit 1;

  insert into public.assistant_conversation_messages(
    conversation_id, tenant_id, role, content, status
  ) values (
    _c.id, _c.tenant_id, 'user', btrim(_message), 'completed'
  ) returning id into _message_id;

  _idem := coalesce(nullif(btrim(_idempotency_key),''), 'assistant.request:' || _message_id::text);

  insert into public.automation_events(
    tenant_id, operation_id, actor_profile_id, event_type, source,
    idempotency_key, correlation_id, payload, dispatch_status
  ) values (
    _c.tenant_id,
    _c.operation_id,
    _c.profile_id,
    'assistant.request',
    'cobs_app',
    _idem,
    'assistant:' || _c.id::text || ':' || _message_id::text,
    jsonb_build_object(
      'message', btrim(_message),
      'channel', _c.channel,
      'locale', _c.locale,
      'human_available', coalesce(_human_available, false),
      'conversation_id', _c.id::text,
      'person_id', _person_id,
      'context', jsonb_build_object(
        'operation', jsonb_build_object('name', coalesce(_operation_name,'')),
        'reservation', '{}'::jsonb,
        'payment', '{}'::jsonb,
        'schedule', '{}'::jsonb,
        'documents', '{}'::jsonb,
        'known_facts', '[]'::jsonb
      )
    ),
    'pending'
  ) returning id into _event_id;

  update public.assistant_conversation_messages
  set automation_event_id = _event_id,
      status = 'pending'
  where id = _message_id;

  update public.assistant_conversations
  set human_available = coalesce(_human_available,false),
      last_message_at = now(),
      updated_at = now()
  where id = _c.id;

  return query select _message_id, _event_id;
end;
$$;

revoke all on function public.assistant_submit_message(uuid,text,boolean,text) from public;
grant execute on function public.assistant_submit_message(uuid,text,boolean,text) to authenticated;

create or replace function app_private.assistant_capture_automation_result()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _event public.automation_events%rowtype;
  _conversation_id uuid;
  _reply text;
begin
  select * into _event from public.automation_events where id = new.automation_event_id;
  if _event.id is null or _event.event_type <> 'assistant.request' then return new; end if;

  begin
    _conversation_id := nullif(_event.payload->>'conversation_id','')::uuid;
  exception when others then
    _conversation_id := null;
  end;
  if _conversation_id is null then return new; end if;

  update public.assistant_conversation_messages
  set status = case when new.outcome = 'completed' then 'completed' else 'failed' end,
      metadata = metadata || jsonb_build_object('automation_result_id', new.id)
  where automation_event_id = new.automation_event_id and role = 'user';

  if new.outcome = 'completed' and coalesce(btrim(new.suggested_reply),'') <> '' then
    _reply := btrim(new.suggested_reply);
    insert into public.assistant_conversation_messages(
      conversation_id, tenant_id, role, content, automation_event_id, automation_result_id, status, metadata
    ) values (
      _conversation_id,
      new.tenant_id,
      'assistant',
      _reply,
      new.automation_event_id,
      new.id,
      'completed',
      jsonb_build_object(
        'intent', new.intent,
        'urgency', new.urgency,
        'summary', new.summary,
        'provider_metadata', new.provider_metadata
      )
    ) on conflict do nothing;
  elsif new.outcome = 'failed' then
    insert into public.assistant_conversation_messages(
      conversation_id, tenant_id, role, content, automation_event_id, automation_result_id, status, metadata
    ) values (
      _conversation_id,
      new.tenant_id,
      'system',
      'Não foi possível concluir esta resposta automaticamente.',
      new.automation_event_id,
      new.id,
      'failed',
      jsonb_build_object('error_code', new.error_code, 'error_message', new.error_message)
    ) on conflict do nothing;
  end if;

  update public.assistant_conversations
  set last_message_at = now(), updated_at = now()
  where id = _conversation_id and tenant_id = new.tenant_id;

  return new;
end;
$$;

drop trigger if exists trg_assistant_capture_automation_result on public.automation_results;
create trigger trg_assistant_capture_automation_result
after insert on public.automation_results
for each row execute function app_private.assistant_capture_automation_result();

grant select on public.assistant_conversations to authenticated;
grant select on public.assistant_conversation_messages to authenticated;

create or replace function public.claim_automation_outbox(_limit integer default 10)
returns setof public.automation_events
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  _safe_limit integer := greatest(1, least(coalesce(_limit, 10), 50));
begin
  return query
  with candidates as (
    select e.id
    from public.automation_events e
    where e.source in ('cobs_db','cobs_app')
      and e.event_type in ('order.confirmed','participant.added','payment.confirmed','payment.pending','assistant.request')
      and e.dispatch_status in ('pending','failed')
      and e.dispatch_attempts < 3
    order by e.created_at asc
    for update skip locked
    limit _safe_limit
  )
  update public.automation_events e
  set dispatch_status='processing',
      dispatch_attempts=e.dispatch_attempts+1,
      last_error_code=null,
      last_error_message=null
  from candidates c
  where e.id=c.id
  returning e.*;
end;
$$;