create type public.external_channel as enum ('test');
create type public.outbox_status as enum ('queued','processing','accepted','sent','delivered','read','retry_wait','failed','dead_letter');
create type public.delivery_attempt_status as enum ('processing','accepted','failed');

create table public.communication_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid not null,
  recipient_id uuid not null,
  person_id uuid not null,
  channel public.external_channel not null,
  status public.outbox_status not null default 'queued',
  destination_snapshot text not null,
  provider_key text,
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error_code text,
  last_error_message text,
  claimed_at timestamptz,
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_outbox_message_fk foreign key (tenant_id,message_id) references public.messages(tenant_id,id) on delete cascade,
  constraint communication_outbox_recipient_fk foreign key (tenant_id,recipient_id) references public.message_recipients(tenant_id,id) on delete cascade,
  constraint communication_outbox_person_fk foreign key (person_id,tenant_id) references public.people(id,tenant_id) on delete cascade,
  constraint communication_outbox_unique unique (message_id,person_id,channel)
);

create table public.communication_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outbox_id uuid not null references public.communication_outbox(id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  status public.delivery_attempt_status not null,
  provider_key text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  unique(outbox_id,attempt_no)
);

create table public.communication_provider_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outbox_id uuid not null references public.communication_outbox(id) on delete cascade,
  channel public.external_channel not null,
  provider_key text not null,
  provider_event_id text not null,
  provider_message_id text,
  event_type text not null check (event_type in ('sent','delivered','read','failed')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload_hash text,
  created_at timestamptz not null default now(),
  unique(provider_key,provider_event_id)
);

create index communication_outbox_due_idx on public.communication_outbox(status,next_attempt_at,created_at);
create index communication_outbox_message_idx on public.communication_outbox(message_id,created_at);
create index communication_delivery_attempts_outbox_idx on public.communication_delivery_attempts(outbox_id,attempt_no);
create index communication_provider_events_outbox_idx on public.communication_provider_events(outbox_id,occurred_at);

alter table public.communication_outbox enable row level security;
alter table public.communication_delivery_attempts enable row level security;
alter table public.communication_provider_events enable row level security;

create policy "w07b operators read outbox" on public.communication_outbox for select to authenticated using (app_private.w08_is_comms_operator(tenant_id));
create policy "w07b recipient reads own outbox" on public.communication_outbox for select to authenticated using (person_id = app_private.w08_current_person_id(tenant_id));
create policy "w07b operators read attempts" on public.communication_delivery_attempts for select to authenticated using (app_private.w08_is_comms_operator(tenant_id));
create policy "w07b operators read provider events" on public.communication_provider_events for select to authenticated using (app_private.w08_is_comms_operator(tenant_id));

grant select on public.communication_outbox to authenticated;
grant select on public.communication_delivery_attempts to authenticated;
grant select on public.communication_provider_events to authenticated;
revoke all on public.communication_outbox from anon;
revoke all on public.communication_delivery_attempts from anon;
revoke all on public.communication_provider_events from anon;

create or replace function app_private.w07b_enqueue_test_delivery(_message_id uuid, _person_id uuid, _destination text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _m public.messages; _r public.message_recipients; _o public.communication_outbox;
begin
  select * into _m from public.messages where id=_message_id;
  if _m.id is null then raise exception 'Message not found'; end if;
  if _m.status <> 'published' then raise exception 'Only a published message can enter an external outbox'; end if;
  select * into _r from public.message_recipients where message_id=_message_id and person_id=_person_id;
  if _r.id is null then raise exception 'Person is not a materialized recipient of this message'; end if;
  if nullif(btrim(coalesce(_destination,'')),'') is null then raise exception 'Destination is required'; end if;
  insert into public.communication_outbox(tenant_id,message_id,recipient_id,person_id,channel,destination_snapshot,next_attempt_at)
  values(_m.tenant_id,_m.id,_r.id,_person_id,'test',btrim(_destination),now())
  on conflict(message_id,person_id,channel) do nothing
  returning * into _o;
  if _o.id is null then select * into _o from public.communication_outbox where message_id=_message_id and person_id=_person_id and channel='test'; end if;
  return jsonb_build_object('outbox_id',_o.id,'status',_o.status,'unchanged',_o.created_at < now());
end $$;

create or replace function app_private.w07b_claim_due_outbox(_limit integer default 50)
returns setof public.communication_outbox language plpgsql security definer set search_path='pg_catalog','public' as $$
begin
  return query
  with picked as (
    select id from public.communication_outbox
    where status in ('queued','retry_wait') and coalesce(next_attempt_at,now()) <= now()
    order by created_at,id for update skip locked limit greatest(1,least(coalesce(_limit,50),200))
  )
  update public.communication_outbox o set status='processing',claimed_at=now(),attempt_count=o.attempt_count+1,updated_at=now()
  from picked where o.id=picked.id returning o.*;
end $$;

create or replace function app_private.w07b_begin_attempt(_outbox_id uuid, _provider_key text default 'test')
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _o public.communication_outbox; _id uuid;
begin
  select * into _o from public.communication_outbox where id=_outbox_id for update;
  if _o.id is null then raise exception 'Outbox item not found'; end if;
  if _o.status <> 'processing' then raise exception 'Only a processing outbox item can begin an attempt'; end if;
  insert into public.communication_delivery_attempts(tenant_id,outbox_id,attempt_no,status,provider_key)
  values(_o.tenant_id,_o.id,_o.attempt_count,'processing',coalesce(nullif(btrim(_provider_key),''),'test')) returning id into _id;
  return _id;
end $$;

create or replace function app_private.w07b_accept_attempt(_outbox_id uuid, _attempt_id uuid, _provider_message_id text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _o public.communication_outbox;
begin
  select * into _o from public.communication_outbox where id=_outbox_id for update;
  if _o.id is null then raise exception 'Outbox item not found'; end if;
  if _o.status <> 'processing' then raise exception 'Only a processing outbox item can be accepted'; end if;
  update public.communication_delivery_attempts set status='accepted',finished_at=now() where id=_attempt_id and outbox_id=_outbox_id and status='processing';
  if not found then raise exception 'Processing attempt not found'; end if;
  update public.communication_outbox set status='accepted',provider_key='test',provider_message_id=_provider_message_id,accepted_at=now(),last_error_code=null,last_error_message=null,updated_at=now() where id=_outbox_id;
  return jsonb_build_object('outbox_id',_outbox_id,'status','accepted','provider_message_id',_provider_message_id);
end $$;

create or replace function app_private.w07b_fail_attempt(_outbox_id uuid, _attempt_id uuid, _retryable boolean, _error_code text, _error_message text, _retry_after interval default interval '1 minute')
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _o public.communication_outbox; _status public.outbox_status;
begin
  select * into _o from public.communication_outbox where id=_outbox_id for update;
  if _o.id is null then raise exception 'Outbox item not found'; end if;
  if _o.status <> 'processing' then raise exception 'Only a processing outbox item can fail'; end if;
  update public.communication_delivery_attempts set status='failed',finished_at=now(),error_code=_error_code,error_message=_error_message where id=_attempt_id and outbox_id=_outbox_id and status='processing';
  if not found then raise exception 'Processing attempt not found'; end if;
  _status := case when _retryable and _o.attempt_count < 3 then 'retry_wait'::public.outbox_status else 'dead_letter'::public.outbox_status end;
  update public.communication_outbox set status=_status,next_attempt_at=case when _status='retry_wait' then now()+coalesce(_retry_after,interval '1 minute') else null end,last_error_code=_error_code,last_error_message=_error_message,failed_at=now(),dead_lettered_at=case when _status='dead_letter' then now() else null end,updated_at=now() where id=_outbox_id;
  return jsonb_build_object('outbox_id',_outbox_id,'status',_status,'attempt_count',_o.attempt_count);
end $$;

create or replace function app_private.w07b_ingest_test_provider_event(_outbox_id uuid,_provider_event_id text,_event_type text,_occurred_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _o public.communication_outbox; _new public.outbox_status; _existing uuid;
begin
  select id into _existing from public.communication_provider_events where provider_key='test' and provider_event_id=_provider_event_id;
  if _existing is not null then return jsonb_build_object('event_id',_existing,'unchanged',true); end if;
  select * into _o from public.communication_outbox where id=_outbox_id for update;
  if _o.id is null then raise exception 'Outbox item not found'; end if;
  if _event_type not in ('sent','delivered','read','failed') then raise exception 'Unsupported provider event'; end if;
  _new := case _event_type when 'sent' then 'sent' when 'delivered' then 'delivered' when 'read' then 'read' else 'failed' end;
  if _event_type='sent' and _o.status not in ('accepted','sent') then raise exception 'Invalid sent transition'; end if;
  if _event_type='delivered' and _o.status not in ('accepted','sent','delivered') then raise exception 'Invalid delivered transition'; end if;
  if _event_type='read' and _o.status not in ('accepted','sent','delivered','read') then raise exception 'Invalid read transition'; end if;
  insert into public.communication_provider_events(tenant_id,outbox_id,channel,provider_key,provider_event_id,provider_message_id,event_type,occurred_at)
  values(_o.tenant_id,_o.id,_o.channel,'test',_provider_event_id,_o.provider_message_id,_event_type,coalesce(_occurred_at,now())) returning id into _existing;
  update public.communication_outbox set status=_new,
    sent_at=case when _event_type='sent' then coalesce(sent_at,_occurred_at,now()) else sent_at end,
    delivered_at=case when _event_type='delivered' then coalesce(delivered_at,_occurred_at,now()) else delivered_at end,
    read_at=case when _event_type='read' then coalesce(read_at,_occurred_at,now()) else read_at end,
    failed_at=case when _event_type='failed' then coalesce(failed_at,_occurred_at,now()) else failed_at end,
    updated_at=now() where id=_o.id;
  return jsonb_build_object('event_id',_existing,'outbox_id',_o.id,'status',_new,'unchanged',false);
end $$;

revoke all on function app_private.w07b_enqueue_test_delivery(uuid,uuid,text) from public,anon,authenticated;
revoke all on function app_private.w07b_claim_due_outbox(integer) from public,anon,authenticated;
revoke all on function app_private.w07b_begin_attempt(uuid,text) from public,anon,authenticated;
revoke all on function app_private.w07b_accept_attempt(uuid,uuid,text) from public,anon,authenticated;
revoke all on function app_private.w07b_fail_attempt(uuid,uuid,boolean,text,text,interval) from public,anon,authenticated;
revoke all on function app_private.w07b_ingest_test_provider_event(uuid,text,text,timestamptz) from public,anon,authenticated;
