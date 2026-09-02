alter type public.external_channel add value if not exists 'whatsapp';

create type public.whatsapp_consent_action as enum ('opt_in','opt_out');
create type public.whatsapp_template_status as enum ('draft','active','retired');

create table public.whatsapp_consent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null,
  action public.whatsapp_consent_action not null,
  source text not null,
  evidence_ref text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint whatsapp_consent_person_fk foreign key (person_id,tenant_id) references public.people(id,tenant_id) on delete cascade
);
create index whatsapp_consent_events_current_idx on public.whatsapp_consent_events(tenant_id,person_id,occurred_at desc,created_at desc,id desc);

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  locale text not null default 'pt-BR',
  title text,
  body text not null,
  status public.whatsapp_template_status not null default 'draft',
  provider_template_name text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,code,locale),
  check (length(btrim(code)) between 2 and 80),
  check (length(btrim(body)) between 1 and 4096)
);

alter table public.communication_outbox add column if not exists whatsapp_template_id uuid references public.whatsapp_templates(id) on delete set null;
alter table public.communication_outbox add column if not exists payload_snapshot jsonb not null default '{}'::jsonb;

alter table public.whatsapp_consent_events enable row level security;
alter table public.whatsapp_templates enable row level security;

create policy "w07b operators read whatsapp consent" on public.whatsapp_consent_events for select to authenticated using (app_private.w08_is_comms_operator(tenant_id));
create policy "w07b self reads whatsapp consent" on public.whatsapp_consent_events for select to authenticated using (person_id=app_private.w08_current_person_id(tenant_id));
create policy "w07b operators read whatsapp templates" on public.whatsapp_templates for select to authenticated using (app_private.w08_is_comms_operator(tenant_id));

grant select on public.whatsapp_consent_events to authenticated;
grant select on public.whatsapp_templates to authenticated;
revoke all on public.whatsapp_consent_events from anon;
revoke all on public.whatsapp_templates from anon;

create or replace function app_private.w07b_current_whatsapp_consent(_tenant_id uuid,_person_id uuid)
returns public.whatsapp_consent_action language sql stable security definer set search_path='pg_catalog','public' as $$
  select e.action from public.whatsapp_consent_events e
  where e.tenant_id=_tenant_id and e.person_id=_person_id
  order by e.occurred_at desc,e.created_at desc,e.id desc limit 1
$$;

create or replace function public.set_my_whatsapp_consent(_tenant_id uuid,_opt_in boolean,_source text default 'app',_evidence_ref text default null,_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _person uuid; _action public.whatsapp_consent_action; _prev jsonb; _id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  _person:=app_private.w08_current_person_id(_tenant_id);
  if _person is null then raise exception 'No person profile is linked to this organization'; end if;
  if nullif(btrim(coalesce(_source,'')),'') is null then raise exception 'Consent source is required'; end if;
  _action:=case when _opt_in then 'opt_in'::public.whatsapp_consent_action else 'opt_out'::public.whatsapp_consent_action end;
  if _idempotency_key is not null then
    begin insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result) values(_tenant_id,auth.uid(),'w07b.set_my_whatsapp_consent',_idempotency_key,'{}');
    exception when unique_violation then select result into _prev from public.idempotency_keys where actor_profile_id=auth.uid() and action='w07b.set_my_whatsapp_consent' and idempotency_key=_idempotency_key; return coalesce(_prev,'{}')||jsonb_build_object('replayed',true); end;
  end if;
  insert into public.whatsapp_consent_events(tenant_id,person_id,action,source,evidence_ref,actor_profile_id)
  values(_tenant_id,_person,_action,btrim(_source),nullif(btrim(coalesce(_evidence_ref,'')),''),auth.uid()) returning id into _id;
  _prev:=jsonb_build_object('consent_event_id',_id,'person_id',_person,'action',_action,'replayed',false);
  if _idempotency_key is not null then update public.idempotency_keys set result=_prev where actor_profile_id=auth.uid() and action='w07b.set_my_whatsapp_consent' and idempotency_key=_idempotency_key; end if;
  return _prev;
end $$;

create or replace function public.record_whatsapp_consent_for_person(_person_id uuid,_opt_in boolean,_source text,_evidence_ref text default null,_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _p public.people; _action public.whatsapp_consent_action; _prev jsonb; _id uuid;
begin
  select * into _p from public.people where id=_person_id;
  if _p.id is null then raise exception 'Person not found'; end if;
  perform app_private.w08_require_comms_operator(_p.tenant_id);
  if nullif(btrim(coalesce(_source,'')),'') is null then raise exception 'Consent source is required'; end if;
  _action:=case when _opt_in then 'opt_in'::public.whatsapp_consent_action else 'opt_out'::public.whatsapp_consent_action end;
  if _idempotency_key is not null then
    begin insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result) values(_p.tenant_id,auth.uid(),'w07b.record_whatsapp_consent',_idempotency_key,'{}');
    exception when unique_violation then select result into _prev from public.idempotency_keys where actor_profile_id=auth.uid() and action='w07b.record_whatsapp_consent' and idempotency_key=_idempotency_key; return coalesce(_prev,'{}')||jsonb_build_object('replayed',true); end;
  end if;
  insert into public.whatsapp_consent_events(tenant_id,person_id,action,source,evidence_ref,actor_profile_id)
  values(_p.tenant_id,_p.id,_action,btrim(_source),nullif(btrim(coalesce(_evidence_ref,'')),''),auth.uid()) returning id into _id;
  _prev:=jsonb_build_object('consent_event_id',_id,'person_id',_p.id,'action',_action,'replayed',false);
  if _idempotency_key is not null then update public.idempotency_keys set result=_prev where actor_profile_id=auth.uid() and action='w07b.record_whatsapp_consent' and idempotency_key=_idempotency_key; end if;
  return _prev;
end $$;

create or replace function public.get_my_whatsapp_consent(_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare _person uuid; _action public.whatsapp_consent_action; _phone text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  _person:=app_private.w08_current_person_id(_tenant_id);
  if _person is null then raise exception 'No person profile is linked to this organization'; end if;
  select phone_e164 into _phone from public.people where id=_person and tenant_id=_tenant_id;
  _action:=app_private.w07b_current_whatsapp_consent(_tenant_id,_person);
  return jsonb_build_object('person_id',_person,'consent',coalesce(_action::text,'unknown'),'has_phone',_phone is not null);
end $$;

create or replace function public.create_whatsapp_template(_tenant_id uuid,_code text,_locale text,_body text,_title text default null,_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _id uuid; _prev jsonb; _res jsonb;
begin
  perform app_private.w08_require_comms_operator(_tenant_id);
  if nullif(btrim(coalesce(_code,'')),'') is null or nullif(btrim(coalesce(_body,'')),'') is null then raise exception 'Template code and body are required'; end if;
  if _idempotency_key is not null then
    begin insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result) values(_tenant_id,auth.uid(),'w07b.create_whatsapp_template',_idempotency_key,'{}');
    exception when unique_violation then select result into _prev from public.idempotency_keys where actor_profile_id=auth.uid() and action='w07b.create_whatsapp_template' and idempotency_key=_idempotency_key; return coalesce(_prev,'{}')||jsonb_build_object('replayed',true); end;
  end if;
  insert into public.whatsapp_templates(tenant_id,code,locale,title,body,created_by) values(_tenant_id,btrim(_code),coalesce(nullif(btrim(coalesce(_locale,'')),''),'pt-BR'),nullif(btrim(coalesce(_title,'')),''),btrim(_body),auth.uid()) returning id into _id;
  _res:=jsonb_build_object('template_id',_id,'status','draft','replayed',false);
  if _idempotency_key is not null then update public.idempotency_keys set result=_res where actor_profile_id=auth.uid() and action='w07b.create_whatsapp_template' and idempotency_key=_idempotency_key; end if;
  return _res;
end $$;

create or replace function public.activate_whatsapp_template(_template_id uuid,_provider_template_name text default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _t public.whatsapp_templates;
begin
  select * into _t from public.whatsapp_templates where id=_template_id for update;
  if _t.id is null then raise exception 'Template not found'; end if;
  perform app_private.w08_require_comms_operator(_t.tenant_id);
  if _t.status='active' and _t.provider_template_name is not distinct from nullif(btrim(coalesce(_provider_template_name,'')),'') then return jsonb_build_object('template_id',_t.id,'status','active','unchanged',true); end if;
  update public.whatsapp_templates set status='active',provider_template_name=nullif(btrim(coalesce(_provider_template_name,'')),''),updated_at=now() where id=_t.id;
  return jsonb_build_object('template_id',_t.id,'status','active','unchanged',false);
end $$;

create or replace function app_private.w07b_enqueue_whatsapp_for_message(_message_id uuid,_template_id uuid)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _m public.messages; _t public.whatsapp_templates; _n int:=0;
begin
  select * into _m from public.messages where id=_message_id;
  if _m.id is null then raise exception 'Message not found'; end if;
  if _m.status<>'published' then raise exception 'Only a published message can enter WhatsApp outbox'; end if;
  select * into _t from public.whatsapp_templates where id=_template_id;
  if _t.id is null or _t.tenant_id<>_m.tenant_id then raise exception 'WhatsApp template not found in this organization'; end if;
  if _t.status<>'active' then raise exception 'WhatsApp template must be active'; end if;
  insert into public.communication_outbox(tenant_id,message_id,recipient_id,person_id,channel,destination_snapshot,next_attempt_at,whatsapp_template_id,payload_snapshot)
  select _m.tenant_id,_m.id,r.id,r.person_id,'whatsapp',p.phone_e164,now(),_t.id,
         jsonb_build_object('template_code',_t.code,'template_locale',_t.locale,'template_body',_t.body,'message_title',_m.title,'message_body',_m.body)
  from public.message_recipients r join public.people p on p.id=r.person_id and p.tenant_id=r.tenant_id
  where r.message_id=_m.id and p.phone_e164 is not null and app_private.w07b_current_whatsapp_consent(_m.tenant_id,p.id)='opt_in'
  on conflict do nothing;
  get diagnostics _n=row_count;
  return jsonb_build_object('message_id',_m.id,'channel','whatsapp','queued',_n);
end $$;

create or replace function app_private.w07b_assert_whatsapp_sendable(_outbox_id uuid)
returns void language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare _o public.communication_outbox; _p public.people;
begin
  select * into _o from public.communication_outbox where id=_outbox_id;
  if _o.id is null or _o.channel<>'whatsapp' then raise exception 'WhatsApp outbox item not found'; end if;
  select * into _p from public.people where id=_o.person_id and tenant_id=_o.tenant_id;
  if _p.phone_e164 is null or _p.phone_e164<>_o.destination_snapshot then raise exception 'WhatsApp destination is no longer current'; end if;
  if app_private.w07b_current_whatsapp_consent(_o.tenant_id,_o.person_id) is distinct from 'opt_in'::public.whatsapp_consent_action then raise exception 'WhatsApp consent is no longer active'; end if;
end $$;

create or replace function app_private.w07b_accept_attempt(_outbox_id uuid,_attempt_id uuid,_provider_message_id text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _o public.communication_outbox; _provider text;
begin
  select * into _o from public.communication_outbox where id=_outbox_id for update;
  if _o.id is null then raise exception 'Outbox item not found'; end if;
  if _o.status<>'processing' then raise exception 'Only a processing outbox item can be accepted'; end if;
  if _o.channel='whatsapp' then perform app_private.w07b_assert_whatsapp_sendable(_o.id); end if;
  select provider_key into _provider from public.communication_delivery_attempts where id=_attempt_id and outbox_id=_outbox_id and status='processing';
  if _provider is null then raise exception 'Processing attempt not found'; end if;
  update public.communication_delivery_attempts set status='accepted',finished_at=now() where id=_attempt_id;
  update public.communication_outbox set status='accepted',provider_key=_provider,provider_message_id=_provider_message_id,accepted_at=now(),last_error_code=null,last_error_message=null,updated_at=now() where id=_outbox_id;
  return jsonb_build_object('outbox_id',_outbox_id,'status','accepted','provider_key',_provider,'provider_message_id',_provider_message_id);
end $$;

create or replace function app_private.w07b_ingest_provider_event(_outbox_id uuid,_provider_key text,_provider_event_id text,_event_type text,_occurred_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _o public.communication_outbox; _new public.outbox_status; _event uuid;
begin
  select id into _event from public.communication_provider_events where provider_key=_provider_key and provider_event_id=_provider_event_id;
  if _event is not null then return jsonb_build_object('event_id',_event,'unchanged',true); end if;
  select * into _o from public.communication_outbox where id=_outbox_id for update;
  if _o.id is null then raise exception 'Outbox item not found'; end if;
  if _o.provider_key is distinct from _provider_key then raise exception 'Provider mismatch'; end if;
  if _event_type not in ('sent','delivered','read','failed') then raise exception 'Unsupported provider event'; end if;
  _new:=case _event_type when 'sent' then 'sent' when 'delivered' then 'delivered' when 'read' then 'read' else 'failed' end;
  if _event_type='sent' and _o.status not in ('accepted','sent') then raise exception 'Invalid sent transition'; end if;
  if _event_type='delivered' and _o.status not in ('accepted','sent','delivered') then raise exception 'Invalid delivered transition'; end if;
  if _event_type='read' and _o.status not in ('accepted','sent','delivered','read') then raise exception 'Invalid read transition'; end if;
  insert into public.communication_provider_events(tenant_id,outbox_id,channel,provider_key,provider_event_id,provider_message_id,event_type,occurred_at)
  values(_o.tenant_id,_o.id,_o.channel,_provider_key,_provider_event_id,_o.provider_message_id,_event_type,coalesce(_occurred_at,now())) returning id into _event;
  update public.communication_outbox set status=_new,
    sent_at=case when _event_type='sent' then coalesce(sent_at,_occurred_at,now()) else sent_at end,
    delivered_at=case when _event_type='delivered' then coalesce(delivered_at,_occurred_at,now()) else delivered_at end,
    read_at=case when _event_type='read' then coalesce(read_at,_occurred_at,now()) else read_at end,
    failed_at=case when _event_type='failed' then coalesce(failed_at,_occurred_at,now()) else failed_at end,updated_at=now() where id=_o.id;
  return jsonb_build_object('event_id',_event,'outbox_id',_o.id,'status',_new,'unchanged',false);
end $$;

revoke all on function app_private.w07b_current_whatsapp_consent(uuid,uuid) from public,anon,authenticated;
revoke all on function app_private.w07b_enqueue_whatsapp_for_message(uuid,uuid) from public,anon,authenticated;
revoke all on function app_private.w07b_assert_whatsapp_sendable(uuid) from public,anon,authenticated;
revoke all on function app_private.w07b_ingest_provider_event(uuid,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.set_my_whatsapp_consent(uuid,boolean,text,text,text) from public,anon;
grant execute on function public.set_my_whatsapp_consent(uuid,boolean,text,text,text) to authenticated;
revoke all on function public.record_whatsapp_consent_for_person(uuid,boolean,text,text,text) from public,anon;
grant execute on function public.record_whatsapp_consent_for_person(uuid,boolean,text,text,text) to authenticated;
revoke all on function public.get_my_whatsapp_consent(uuid) from public,anon;
grant execute on function public.get_my_whatsapp_consent(uuid) to authenticated;
revoke all on function public.create_whatsapp_template(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.create_whatsapp_template(uuid,text,text,text,text,text) to authenticated;
revoke all on function public.activate_whatsapp_template(uuid,text) from public,anon;
grant execute on function public.activate_whatsapp_template(uuid,text) to authenticated;