create type public.device_platform as enum ('ios','android','web');
create type public.push_provider as enum ('test','fcm','apns','web_push');

create table public.communication_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform public.device_platform not null,
  installation_id text not null,
  push_provider public.push_provider not null,
  push_token text not null,
  locale text,
  enabled boolean not null default true,
  registered_at timestamptz not null default now(),
  token_refreshed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_devices_person_fk foreign key (person_id,tenant_id) references public.people(id,tenant_id) on delete cascade,
  constraint communication_devices_installation_nonblank check (length(btrim(installation_id)) between 8 and 200),
  constraint communication_devices_token_nonblank check (length(btrim(push_token)) between 8 and 4096),
  constraint communication_devices_locale_nonblank check (locale is null or length(btrim(locale)) between 2 and 35),
  constraint communication_devices_revoke_ck check ((revoked_at is null and revoke_reason is null) or (revoked_at is not null and revoke_reason is not null)),
  unique(tenant_id,installation_id)
);

create unique index communication_devices_active_token_once
on public.communication_devices(push_provider,push_token)
where revoked_at is null and enabled;

create index communication_devices_person_idx on public.communication_devices(tenant_id,person_id,enabled,revoked_at);
create index communication_devices_profile_idx on public.communication_devices(profile_id,tenant_id);

alter table public.communication_devices enable row level security;
-- No direct table grants to authenticated: token material remains server-private.
revoke all on public.communication_devices from public,anon,authenticated;

create or replace function app_private.w07b_current_device_person(_tenant_id uuid)
returns public.people language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare _p public.people;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into _p from public.people p
   where p.tenant_id=_tenant_id and p.profile_id=auth.uid()
   order by p.created_at,p.id limit 1;
  if _p.id is null then raise exception 'No person profile is linked to this organization'; end if;
  return _p;
end $$;

create or replace function public.register_my_device(
  _tenant_id uuid,
  _platform public.device_platform,
  _installation_id text,
  _push_provider public.push_provider,
  _push_token text,
  _idempotency_key text,
  _locale text default null
) returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _p public.people; _d public.communication_devices; _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _prev jsonb; _out jsonb;
begin
  _p:=app_private.w07b_current_device_person(_tenant_id);
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if length(btrim(coalesce(_installation_id,''))) < 8 then raise exception 'A valid installation id is required'; end if;
  if length(btrim(coalesce(_push_token,''))) < 8 then raise exception 'A valid push token is required'; end if;
  if _locale is not null and length(btrim(_locale)) < 2 then raise exception 'Invalid locale'; end if;

  begin
    insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result)
    values(_tenant_id,auth.uid(),'w07b.register_my_device',_key,'{}'::jsonb);
  exception when unique_violation then
    select result into _prev from public.idempotency_keys
     where actor_profile_id=auth.uid() and action='w07b.register_my_device' and idempotency_key=_key;
    return coalesce(_prev,'{}'::jsonb) || jsonb_build_object('replayed',true);
  end;

  select * into _d from public.communication_devices
   where tenant_id=_tenant_id and installation_id=btrim(_installation_id) for update;

  if _d.id is not null and _d.person_id <> _p.id then
    raise exception 'This device installation is already registered to another person';
  end if;

  if _d.id is null then
    insert into public.communication_devices(tenant_id,person_id,profile_id,platform,installation_id,push_provider,push_token,locale)
    values(_tenant_id,_p.id,auth.uid(),_platform,btrim(_installation_id),_push_provider,btrim(_push_token),nullif(btrim(coalesce(_locale,'')),''))
    returning * into _d;
  else
    update public.communication_devices set
      platform=_platform,
      push_provider=_push_provider,
      push_token=btrim(_push_token),
      locale=coalesce(nullif(btrim(coalesce(_locale,'')),''),locale),
      enabled=true,
      revoked_at=null,
      revoke_reason=null,
      token_refreshed_at=case when push_token is distinct from btrim(_push_token) or push_provider is distinct from _push_provider then now() else token_refreshed_at end,
      last_seen_at=now(),
      updated_at=now()
    where id=_d.id returning * into _d;
  end if;

  _out:=jsonb_build_object('device_id',_d.id,'platform',_d.platform,'provider',_d.push_provider,'enabled',_d.enabled,'replayed',false);
  update public.idempotency_keys set result=_out
   where actor_profile_id=auth.uid() and action='w07b.register_my_device' and idempotency_key=_key;
  perform app_private.record_audit_event(_tenant_id,auth.uid(),'w07b.device_registered','communication_device',_d.id,_key,
    jsonb_build_object('platform',_d.platform,'provider',_d.push_provider));
  return _out;
end $$;

create or replace function public.refresh_my_push_token(
  _device_id uuid,
  _push_provider public.push_provider,
  _push_token text,
  _idempotency_key text
) returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _d public.communication_devices; _p public.people; _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _prev jsonb; _out jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if length(btrim(coalesce(_push_token,''))) < 8 then raise exception 'A valid push token is required'; end if;
  select * into _d from public.communication_devices where id=_device_id for update;
  if _d.id is null then raise exception 'Device not found'; end if;
  _p:=app_private.w07b_current_device_person(_d.tenant_id);
  if _d.person_id<>_p.id or _d.profile_id<>auth.uid() then raise exception 'Device not found'; end if;

  begin
    insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result)
    values(_d.tenant_id,auth.uid(),'w07b.refresh_my_push_token',_key,'{}'::jsonb);
  exception when unique_violation then
    select result into _prev from public.idempotency_keys
     where actor_profile_id=auth.uid() and action='w07b.refresh_my_push_token' and idempotency_key=_key;
    return coalesce(_prev,'{}'::jsonb) || jsonb_build_object('replayed',true);
  end;

  update public.communication_devices set push_provider=_push_provider,push_token=btrim(_push_token),enabled=true,revoked_at=null,revoke_reason=null,token_refreshed_at=now(),last_seen_at=now(),updated_at=now()
   where id=_device_id returning * into _d;
  _out:=jsonb_build_object('device_id',_d.id,'provider',_d.push_provider,'enabled',true,'replayed',false);
  update public.idempotency_keys set result=_out where actor_profile_id=auth.uid() and action='w07b.refresh_my_push_token' and idempotency_key=_key;
  perform app_private.record_audit_event(_d.tenant_id,auth.uid(),'w07b.device_token_refreshed','communication_device',_d.id,_key,jsonb_build_object('provider',_d.push_provider));
  return _out;
end $$;

create or replace function public.revoke_my_device(_device_id uuid,_reason text,_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare _d public.communication_devices; _p public.people; _key text:=nullif(btrim(coalesce(_idempotency_key,'')),''); _why text:=nullif(btrim(coalesce(_reason,'')),''); _prev jsonb; _out jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _why is null then raise exception 'A reason is required to revoke a device'; end if;
  perform app_private.assert_generic_note(_why);
  select * into _d from public.communication_devices where id=_device_id for update;
  if _d.id is null then raise exception 'Device not found'; end if;
  _p:=app_private.w07b_current_device_person(_d.tenant_id);
  if _d.person_id<>_p.id or _d.profile_id<>auth.uid() then raise exception 'Device not found'; end if;

  begin
    insert into public.idempotency_keys(tenant_id,actor_profile_id,action,idempotency_key,result)
    values(_d.tenant_id,auth.uid(),'w07b.revoke_my_device',_key,'{}'::jsonb);
  exception when unique_violation then
    select result into _prev from public.idempotency_keys
     where actor_profile_id=auth.uid() and action='w07b.revoke_my_device' and idempotency_key=_key;
    return coalesce(_prev,'{}'::jsonb) || jsonb_build_object('replayed',true);
  end;

  if _d.revoked_at is not null or not _d.enabled then
    _out:=jsonb_build_object('device_id',_d.id,'enabled',false,'unchanged',true,'replayed',false);
  else
    update public.communication_devices set enabled=false,revoked_at=now(),revoke_reason=_why,updated_at=now() where id=_d.id returning * into _d;
    _out:=jsonb_build_object('device_id',_d.id,'enabled',false,'unchanged',false,'replayed',false);
    perform app_private.record_audit_event(_d.tenant_id,auth.uid(),'w07b.device_revoked','communication_device',_d.id,_key,jsonb_build_object('reason',_why));
  end if;
  update public.idempotency_keys set result=_out where actor_profile_id=auth.uid() and action='w07b.revoke_my_device' and idempotency_key=_key;
  return _out;
end $$;

create or replace function public.get_my_devices(_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare _p public.people; _rows jsonb;
begin
  _p:=app_private.w07b_current_device_person(_tenant_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'device_id',d.id,'platform',d.platform,'provider',d.push_provider,'locale',d.locale,'enabled',d.enabled,
    'registered_at',d.registered_at,'token_refreshed_at',d.token_refreshed_at,'last_seen_at',d.last_seen_at,'revoked_at',d.revoked_at
  ) order by d.registered_at,d.id),'[]'::jsonb) into _rows
  from public.communication_devices d where d.tenant_id=_tenant_id and d.person_id=_p.id and d.profile_id=auth.uid();
  return jsonb_build_object('person_id',_p.id,'devices',_rows);
end $$;

revoke all on function app_private.w07b_current_device_person(uuid) from public,anon,authenticated;
grant execute on function public.register_my_device(uuid,public.device_platform,text,public.push_provider,text,text,text) to authenticated;
grant execute on function public.refresh_my_push_token(uuid,public.push_provider,text,text) to authenticated;
grant execute on function public.revoke_my_device(uuid,text,text) to authenticated;
grant execute on function public.get_my_devices(uuid) to authenticated;
revoke all on function public.register_my_device(uuid,public.device_platform,text,public.push_provider,text,text,text) from anon;
revoke all on function public.refresh_my_push_token(uuid,public.push_provider,text,text) from anon;
revoke all on function public.revoke_my_device(uuid,text,text) from anon;
revoke all on function public.get_my_devices(uuid) from anon;