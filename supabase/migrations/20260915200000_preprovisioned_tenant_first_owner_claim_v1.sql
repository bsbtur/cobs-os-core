-- COBS OS V1 · administrative first-owner claim for pre-provisioned tenants
-- Narrow bootstrap escape hatch: NOT client-callable. Intended for an audited
-- operator/admin action after a real Auth identity has been created and confirmed.

create or replace function app_private.admin_claim_preprovisioned_tenant_owner(
  _tenant_slug text,
  _profile_id uuid,
  _correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _tenant public.tenants;
  _profile public.profiles;
  _auth_email text;
  _display_name text;
  _membership_id uuid;
  _person_id uuid;
  _membership_count integer;
  _result jsonb;
begin
  if _profile_id is null then
    raise exception 'Profile id is required';
  end if;
  if nullif(trim(coalesce(_tenant_slug, '')), '') is null then
    raise exception 'Tenant slug is required';
  end if;

  select u.email into _auth_email
  from auth.users u
  where u.id = _profile_id
    and u.email_confirmed_at is not null;
  if _auth_email is null then
    raise exception 'A confirmed Auth identity is required';
  end if;

  select * into _tenant
  from public.tenants t
  where lower(t.slug) = lower(trim(_tenant_slug))
  for update;
  if _tenant.id is null then
    raise exception 'Pre-provisioned tenant not found';
  end if;

  select count(*) into _membership_count
  from public.memberships m
  where m.tenant_id = _tenant.id;
  if _membership_count <> 0 then
    raise exception 'Tenant already has memberships';
  end if;

  insert into public.profiles (id, email)
  values (_profile_id, _auth_email)
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email)
  returning * into _profile;

  insert into public.memberships (tenant_id, profile_id, role, status)
  values (_tenant.id, _profile_id, 'owner', 'active')
  returning id into _membership_id;

  _display_name := coalesce(nullif(trim(coalesce(_profile.display_name, '')), ''), _auth_email, 'Owner');

  select pe.id into _person_id
  from public.people pe
  where pe.tenant_id = _tenant.id
    and pe.profile_id = _profile_id;

  if _person_id is null then
    select pe.id into _person_id
    from public.people pe
    where pe.tenant_id = _tenant.id
      and lower(pe.email) = lower(_auth_email)
    for update;
  end if;

  if _person_id is null then
    insert into public.people (tenant_id, profile_id, full_name, email, preferred_locale)
    values (_tenant.id, _profile_id, _display_name, _auth_email, _tenant.default_locale)
    returning id into _person_id;
  else
    update public.people
    set profile_id = _profile_id,
        email = coalesce(email, _auth_email),
        full_name = coalesce(nullif(trim(full_name), ''), _display_name)
    where id = _person_id;
  end if;

  update public.tenants
  set created_by = coalesce(created_by, _profile_id)
  where id = _tenant.id;

  perform app_private.record_audit_event(
    _tenant.id,
    _profile_id,
    'tenant.first_owner_claimed',
    'tenant',
    _tenant.id,
    nullif(trim(coalesce(_correlation_id, '')), ''),
    jsonb_build_object('membership_id', _membership_id, 'person_id', _person_id, 'method', 'admin_preprovisioned_claim')
  );

  _result := jsonb_build_object(
    'tenant_id', _tenant.id,
    'slug', _tenant.slug,
    'membership_id', _membership_id,
    'person_id', _person_id,
    'role', 'owner',
    'status', 'active'
  );
  return _result;
end;
$$;

-- Never expose this bootstrap escape hatch to browser/API user roles.
revoke all on function app_private.admin_claim_preprovisioned_tenant_owner(text, uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.admin_claim_preprovisioned_tenant_owner(text, uuid, text)
  to service_role;

-- Keep the SECURITY DEFINER inventory fail-closed: explicitly register the new RPC.
insert into app_private.rpc_security_allowlist_v1
(schema_name, function_name, identity_args, classification,
 expected_authenticated, expected_anon, expected_service_role, captured_at)
values (
  'app_private',
  'admin_claim_preprovisioned_tenant_owner',
  '_tenant_slug text, _profile_id uuid, _correlation_id text',
  'SERVICE_ROLE',
  false,
  false,
  true,
  now()
)
on conflict (schema_name, function_name, identity_args) do update
set classification = excluded.classification,
    expected_authenticated = excluded.expected_authenticated,
    expected_anon = excluded.expected_anon,
    expected_service_role = excluded.expected_service_role,
    captured_at = excluded.captured_at;

do $do$
declare v_issues integer;
begin
  select count(*) into v_issues from app_private.assert_rpc_security_allowlist_v1();
  if v_issues <> 0 then
    raise exception 'rpc_security_allowlist_gate_failed_with_%_issues', v_issues;
  end if;
end
$do$;