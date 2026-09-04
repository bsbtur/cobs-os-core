CREATE OR REPLACE FUNCTION public.register_my_device(_tenant_id uuid, _platform public.device_platform, _installation_id text, _push_provider public.push_provider, _push_token text, _idempotency_key text, _locale text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
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

  -- Revoke stale device bindings for the same person after an account/profile relink.
  update public.communication_devices
     set enabled=false,
         revoked_at=coalesce(revoked_at,now()),
         revoke_reason=coalesce(revoke_reason,'profile_relinked'),
         updated_at=now()
   where tenant_id=_tenant_id
     and person_id=_p.id
     and profile_id is distinct from auth.uid()
     and enabled=true;

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
      profile_id=auth.uid(),
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
end $function$;