-- COBS OS · CENTRAL / ARQUITETURA
-- Governed post-creation tenant settings mutation.
-- Keeps organization defaults behind an audited, idempotent owner/admin RPC.

revoke update on table public.tenants from authenticated;

create or replace function public.update_tenant_settings(
  _tenant_id uuid,
  _country_code text,
  _default_locale text,
  _timezone text,
  _currency_code text,
  _idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _key text := nullif(trim(coalesce(_idempotency_key, '')), '');
  _existing jsonb;
  _tenant public.tenants;
  _country text := upper(trim(coalesce(_country_code, '')));
  _locale text := trim(coalesce(_default_locale, ''));
  _tz text := trim(coalesce(_timezone, ''));
  _currency text := upper(trim(coalesce(_currency_code, '')));
  _before jsonb;
  _after jsonb;
begin
  if _uid is null then
    raise exception 'Authentication required';
  end if;

  if _tenant_id is null then
    raise exception 'Organization is required';
  end if;

  if not app_private.has_tenant_role(
    _tenant_id,
    array['owner','admin']::public.app_role[]
  ) then
    raise exception 'Only owners and admins can update organization settings';
  end if;

  if _key is null then
    raise exception 'Idempotency key is required';
  end if;

  if _country !~ '^[A-Z]{2}$' then
    raise exception 'Country code must be ISO 3166-1 alpha-2';
  end if;

  if _currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency code must be ISO 4217 alpha-3';
  end if;

  if _locale !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' then
    raise exception 'Default locale must be a valid BCP 47 language tag';
  end if;

  if _tz = '' or not exists (
    select 1
      from pg_catalog.pg_timezone_names t
      where t.name = _tz
  ) then
    raise exception 'Timezone must be a valid IANA timezone';
  end if;

  -- Serialize the same actor/action/key before consulting the ledger so
  -- concurrent retries cannot race into the unique idempotency index.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      _uid::text || ':tenant.settings.update:' || _key,
      0
    )
  );

  select k.result into _existing
    from public.idempotency_keys k
    where k.actor_profile_id = _uid
      and k.action = 'tenant.settings.update'
      and k.idempotency_key = _key;

  if _existing is not null then
    if (_existing ->> 'tenant_id')::uuid is distinct from _tenant_id then
      raise exception 'Idempotency key already used for another organization';
    end if;

    if (_existing ->> 'country_code') is distinct from _country
       or (_existing ->> 'default_locale') is distinct from _locale
       or (_existing ->> 'timezone') is distinct from _tz
       or (_existing ->> 'currency_code') is distinct from _currency then
      raise exception 'Idempotency key already used with different settings';
    end if;

    return _existing;
  end if;

  select * into _tenant
    from public.tenants t
    where t.id = _tenant_id
    for update;

  if _tenant.id is null then
    raise exception 'Organization not found';
  end if;

  _before := jsonb_build_object(
    'country_code', trim(_tenant.country_code::text),
    'default_locale', _tenant.default_locale,
    'timezone', _tenant.timezone,
    'currency_code', trim(_tenant.currency_code::text)
  );

  update public.tenants
    set country_code = _country,
        default_locale = _locale,
        timezone = _tz,
        currency_code = _currency
    where id = _tenant_id
    returning * into _tenant;

  _after := jsonb_build_object(
    'country_code', trim(_tenant.country_code::text),
    'default_locale', _tenant.default_locale,
    'timezone', _tenant.timezone,
    'currency_code', trim(_tenant.currency_code::text)
  );

  perform app_private.record_audit_event(
    _tenant_id,
    _uid,
    'tenant.settings.updated',
    'tenant',
    _tenant_id,
    _key,
    jsonb_build_object(
      'before', _before,
      'after', _after
    )
  );

  _existing := jsonb_build_object(
    'tenant_id', _tenant_id,
    'country_code', trim(_tenant.country_code::text),
    'default_locale', _tenant.default_locale,
    'timezone', _tenant.timezone,
    'currency_code', trim(_tenant.currency_code::text),
    'updated_at', _tenant.updated_at
  );

  insert into public.idempotency_keys (
    tenant_id,
    actor_profile_id,
    action,
    idempotency_key,
    result
  ) values (
    _tenant_id,
    _uid,
    'tenant.settings.update',
    _key,
    _existing
  );

  return _existing;
end;
$$;

revoke all on function public.update_tenant_settings(uuid, text, text, text, text, text)
  from public, anon;
grant execute on function public.update_tenant_settings(uuid, text, text, text, text, text)
  to authenticated;
