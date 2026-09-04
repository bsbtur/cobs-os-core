do $$
begin
  if not exists (select 1 from vault.secrets where name='cobs_whatsapp_sender_internal_token') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'cobs_whatsapp_sender_internal_token','Internal token for COBS WhatsApp sender cron',null);
  end if;
end $$;

create or replace function public.w07_get_meta_whatsapp_config()
returns jsonb
language sql
security definer
set search_path='pg_catalog','public','vault'
as $$
  select jsonb_build_object(
    'access_token', max(decrypted_secret) filter (where name='cobs_whatsapp_meta_access_token'),
    'phone_number_id', max(decrypted_secret) filter (where name='cobs_whatsapp_meta_phone_number_id'),
    'verify_token_configured', (max(decrypted_secret) filter (where name='cobs_whatsapp_meta_verify_token')) is not null,
    'app_secret_configured', (max(decrypted_secret) filter (where name='cobs_whatsapp_meta_app_secret')) is not null,
    'graph_version', coalesce(max(decrypted_secret) filter (where name='cobs_whatsapp_meta_graph_version'),'v23.0')
  )
  from vault.decrypted_secrets
  where name in ('cobs_whatsapp_meta_access_token','cobs_whatsapp_meta_phone_number_id','cobs_whatsapp_meta_verify_token','cobs_whatsapp_meta_app_secret','cobs_whatsapp_meta_graph_version');
$$;

create or replace function public.w07_validate_whatsapp_sender_token(_token text)
returns boolean
language sql
security definer
set search_path='pg_catalog','vault'
as $$
  select exists(select 1 from vault.decrypted_secrets where name='cobs_whatsapp_sender_internal_token' and decrypted_secret=_token);
$$;

create or replace function public.w07_verify_meta_webhook_token(_token text)
returns boolean
language sql
security definer
set search_path='pg_catalog','vault'
as $$
  select exists(select 1 from vault.decrypted_secrets where name='cobs_whatsapp_meta_verify_token' and decrypted_secret=_token);
$$;

create or replace function public.w07_verify_meta_signature(_raw_body text,_signature text)
returns boolean
language plpgsql
security definer
set search_path='pg_catalog','public','vault','extensions'
as $$
declare _secret text; _expected text; _supplied text;
begin
  select decrypted_secret into _secret from vault.decrypted_secrets where name='cobs_whatsapp_meta_app_secret' limit 1;
  if _secret is null or _raw_body is null or _signature is null then return false; end if;
  _supplied := lower(regexp_replace(_signature,'^sha256=','','i'));
  _expected := encode(extensions.hmac(convert_to(_raw_body,'UTF8'),convert_to(_secret,'UTF8'),'sha256'),'hex');
  return length(_supplied)=length(_expected) and _supplied=_expected;
end $$;

create or replace function public.w07_claim_whatsapp_outbox(_limit integer default 25)
returns table(
  id uuid, tenant_id uuid, message_id uuid, recipient_id uuid, person_id uuid,
  destination_snapshot text, attempt_count integer, payload_snapshot jsonb,
  whatsapp_template_id uuid, provider_template_name text, template_locale text
)
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
begin
  return query
  with picked as (
    select o.id
    from public.communication_outbox o
    where o.channel='whatsapp'
      and o.status in ('queued','retry_wait')
      and coalesce(o.next_attempt_at,now()) <= now()
    order by o.created_at,o.id
    for update skip locked
    limit greatest(1,least(coalesce(_limit,25),100))
  ), claimed as (
    update public.communication_outbox o
       set status='processing', claimed_at=now(), attempt_count=o.attempt_count+1, updated_at=now()
      from picked
     where o.id=picked.id
    returning o.*
  )
  select c.id,c.tenant_id,c.message_id,c.recipient_id,c.person_id,c.destination_snapshot,c.attempt_count,
         c.payload_snapshot,c.whatsapp_template_id,t.provider_template_name,t.locale
    from claimed c
    left join public.whatsapp_templates t on t.id=c.whatsapp_template_id;
end $$;

create or replace function public.w07_mark_whatsapp_send_accepted(_outbox_id uuid,_provider_message_id text)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare _o public.communication_outbox; _attempt uuid;
begin
  select * into _o from public.communication_outbox where id=_outbox_id for update;
  if _o.id is null then raise exception 'Outbox item not found'; end if;
  if _o.channel<>'whatsapp' then raise exception 'Outbox item is not WhatsApp'; end if;
  if _o.status not in ('processing','accepted') then raise exception 'Invalid accept transition from %',_o.status; end if;
  if nullif(btrim(coalesce(_provider_message_id,'')),'') is null then raise exception 'Provider message id is required'; end if;
  update public.communication_outbox
     set provider_key='meta_whatsapp_cloud',provider_message_id=_provider_message_id,status='accepted',
         accepted_at=coalesce(accepted_at,now()),last_error_code=null,last_error_message=null,updated_at=now()
   where id=_outbox_id;
  insert into public.communication_delivery_attempts(tenant_id,outbox_id,attempt_no,status,provider_key,started_at,finished_at)
  values(_o.tenant_id,_o.id,greatest(_o.attempt_count,1),'accepted','meta_whatsapp_cloud',coalesce(_o.claimed_at,now()),now())
  returning id into _attempt;
  return jsonb_build_object('outbox_id',_o.id,'provider_message_id',_provider_message_id,'status','accepted','attempt_id',_attempt);
end $$;

create or replace function public.w07_mark_whatsapp_send_failed(_outbox_id uuid,_error_code text,_error_message text,_retryable boolean default true)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare _o public.communication_outbox; _attempt uuid; _new public.outbox_status; _next timestamptz;
begin
  select * into _o from public.communication_outbox where id=_outbox_id for update;
  if _o.id is null then raise exception 'Outbox item not found'; end if;
  if _o.channel<>'whatsapp' then raise exception 'Outbox item is not WhatsApp'; end if;
  if _o.status not in ('processing','retry_wait') then raise exception 'Invalid failure transition from %',_o.status; end if;
  if coalesce(_retryable,true) and _o.attempt_count < 5 then
    _new:='retry_wait';
    _next:=now() + make_interval(mins => least(30, greatest(1, power(2,greatest(_o.attempt_count-1,0))::int)));
  else
    _new:='failed'; _next:=null;
  end if;
  update public.communication_outbox
     set status=_new,next_attempt_at=_next,last_error_code=left(coalesce(_error_code,'send_failed'),200),
         last_error_message=left(coalesce(_error_message,'WhatsApp provider send failed'),1000),
         failed_at=case when _new='failed' then coalesce(failed_at,now()) else failed_at end,updated_at=now()
   where id=_outbox_id;
  insert into public.communication_delivery_attempts(tenant_id,outbox_id,attempt_no,status,provider_key,started_at,finished_at,error_code,error_message)
  values(_o.tenant_id,_o.id,greatest(_o.attempt_count,1),'failed','meta_whatsapp_cloud',coalesce(_o.claimed_at,now()),now(),left(coalesce(_error_code,'send_failed'),200),left(coalesce(_error_message,'WhatsApp provider send failed'),1000))
  returning id into _attempt;
  return jsonb_build_object('outbox_id',_o.id,'status',_new,'next_attempt_at',_next,'attempt_id',_attempt);
end $$;

create or replace function public.w07_ingest_whatsapp_provider_status(_provider_message_id text,_provider_event_id text,_event_type text,_occurred_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','app_private'
as $$
declare _o uuid;
begin
  select id into _o from public.communication_outbox
   where provider_key='meta_whatsapp_cloud' and provider_message_id=_provider_message_id
   order by created_at desc limit 1;
  if _o is null then return jsonb_build_object('ignored','unknown_provider_message','provider_message_id',_provider_message_id); end if;
  return app_private.w07b_ingest_provider_event(_o,'meta_whatsapp_cloud',_provider_event_id,_event_type,coalesce(_occurred_at,now()));
end $$;

revoke all on function public.w07_get_meta_whatsapp_config() from public,anon,authenticated;
revoke all on function public.w07_validate_whatsapp_sender_token(text) from public,anon,authenticated;
revoke all on function public.w07_verify_meta_webhook_token(text) from public,anon,authenticated;
revoke all on function public.w07_verify_meta_signature(text,text) from public,anon,authenticated;
revoke all on function public.w07_claim_whatsapp_outbox(integer) from public,anon,authenticated;
revoke all on function public.w07_mark_whatsapp_send_accepted(uuid,text) from public,anon,authenticated;
revoke all on function public.w07_mark_whatsapp_send_failed(uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.w07_ingest_whatsapp_provider_status(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.w07_get_meta_whatsapp_config() to service_role;
grant execute on function public.w07_validate_whatsapp_sender_token(text) to service_role;
grant execute on function public.w07_verify_meta_webhook_token(text) to service_role;
grant execute on function public.w07_verify_meta_signature(text,text) to service_role;
grant execute on function public.w07_claim_whatsapp_outbox(integer) to service_role;
grant execute on function public.w07_mark_whatsapp_send_accepted(uuid,text) to service_role;
grant execute on function public.w07_mark_whatsapp_send_failed(uuid,text,text,boolean) to service_role;
grant execute on function public.w07_ingest_whatsapp_provider_status(text,text,text,timestamptz) to service_role;