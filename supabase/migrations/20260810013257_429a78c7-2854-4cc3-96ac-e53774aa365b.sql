-- =====================================================================
-- COBS OS · W01 · Identity / Tenant / Authorization / Security baseline
-- =====================================================================

create schema if not exists app_private;
revoke all on schema app_private from public;

-- ------------------------------ enums --------------------------------
create type public.app_role as enum ('owner', 'admin', 'operations_agent', 'member');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');
create type public.membership_status as enum ('active', 'suspended');

-- --------------------------- shared trigger --------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------ tenants ------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  country_code char(2) not null default 'BR',            -- ISO 3166-1 alpha-2
  default_locale text not null default 'pt-BR',           -- BCP 47
  timezone text not null default 'America/Sao_Paulo',     -- IANA
  currency_code char(3) not null default 'BRL',           -- ISO 4217
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tenants_slug_key on public.tenants (lower(slug));
alter table public.tenants add constraint tenants_slug_format
  check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$');
alter table public.tenants add constraint tenants_country_format check (country_code ~ '^[A-Z]{2}$');
alter table public.tenants add constraint tenants_currency_format check (currency_code ~ '^[A-Z]{3}$');

GRANT SELECT, UPDATE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
alter table public.tenants enable row level security;

create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

-- ------------------------------ profiles -----------------------------
-- 1:1 with an auth account. NOT a foreign key target for business data.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  preferred_locale text not null default 'pt-BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
alter table public.profiles enable row level security;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------- memberships ----------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'member',
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, profile_id)
);
create index memberships_profile_idx on public.memberships (profile_id);
create index memberships_tenant_idx on public.memberships (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
alter table public.memberships enable row level security;

create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

-- ------------------------------- people ------------------------------
-- A human inside a tenant. May exist with NO login (profile_id is null).
create table public.people (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text,
  phone_e164 text,
  country_code char(2),
  preferred_locale text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index people_tenant_profile_key on public.people (tenant_id, profile_id)
  where profile_id is not null;
create unique index people_tenant_email_key on public.people (tenant_id, lower(email))
  where email is not null;
create index people_tenant_idx on public.people (tenant_id);
alter table public.people add constraint people_phone_format
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;
alter table public.people enable row level security;

create trigger people_updated_at before update on public.people
  for each row execute function public.set_updated_at();

-- ---------------------------- invitations ----------------------------
-- Only the sha-256 hash of the invitation token is persisted.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'member',
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  invited_by_profile_id uuid references public.profiles(id) on delete set null,
  accepted_by_profile_id uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invitations_tenant_idx on public.invitations (tenant_id);
create unique index invitations_pending_email_key on public.invitations (tenant_id, lower(email))
  where status = 'pending';
alter table public.invitations add constraint invitations_token_hash_format
  check (token_hash ~ '^[0-9a-f]{64}$');

GRANT SELECT, UPDATE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
alter table public.invitations enable row level security;

create trigger invitations_updated_at before update on public.invitations
  for each row execute function public.set_updated_at();

-- --------------------------- audit_events ----------------------------
-- Append-only. No INSERT/UPDATE/DELETE grants for app roles.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  subject_type text,
  subject_id uuid,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_tenant_idx on public.audit_events (tenant_id, occurred_at desc);

GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
alter table public.audit_events enable row level security;

create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;
create trigger audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function public.reject_audit_mutation();

-- -------------------------- idempotency ------------------------------
create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete cascade,
  action text not null,
  idempotency_key text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index idempotency_keys_scope_key
  on public.idempotency_keys (actor_profile_id, action, idempotency_key);

GRANT SELECT ON public.idempotency_keys TO authenticated;
GRANT ALL ON public.idempotency_keys TO service_role;
alter table public.idempotency_keys enable row level security;

-- ===================== app_private authorization =====================
create or replace function app_private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$ select auth.uid() $$;

create or replace function app_private.is_tenant_member(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = _tenant_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
  )
$$;

create or replace function app_private.has_tenant_role(_tenant_id uuid, _roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = _tenant_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and m.role = any(_roles)
  )
$$;

create or replace function app_private.record_audit_event(
  _tenant_id uuid,
  _actor_profile_id uuid,
  _action text,
  _subject_type text,
  _subject_id uuid,
  _correlation_id text,
  _metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _id uuid;
begin
  insert into public.audit_events
    (tenant_id, actor_profile_id, action, subject_type, subject_id, correlation_id, metadata)
  values
    (_tenant_id, _actor_profile_id, _action, _subject_type, _subject_id, _correlation_id,
     coalesce(_metadata, '{}'::jsonb))
  returning id into _id;
  return _id;
end;
$$;

revoke all on function app_private.current_profile_id() from public, anon, authenticated;
revoke all on function app_private.is_tenant_member(uuid) from public, anon, authenticated;
revoke all on function app_private.has_tenant_role(uuid, public.app_role[]) from public, anon, authenticated;
revoke all on function app_private.record_audit_event(uuid, uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;

-- ============================== policies =============================
-- tenants
create policy tenants_select_member on public.tenants for select to authenticated
  using (app_private.is_tenant_member(id));
create policy tenants_update_owner_admin on public.tenants for update to authenticated
  using (app_private.has_tenant_role(id, array['owner','admin']::public.app_role[]))
  with check (app_private.has_tenant_role(id, array['owner','admin']::public.app_role[]));

-- profiles
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_select_co_member on public.profiles for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.profile_id = public.profiles.id
      and app_private.is_tenant_member(m.tenant_id)
  ));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships
create policy memberships_select_member on public.memberships for select to authenticated
  using (app_private.is_tenant_member(tenant_id));
create policy memberships_update_owner_admin on public.memberships for update to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]))
  with check (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));
create policy memberships_delete_owner_admin on public.memberships for delete to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));
-- no INSERT policy: membership creation only through SECURITY DEFINER commands

-- people
create policy people_select_member on public.people for select to authenticated
  using (app_private.is_tenant_member(tenant_id));
create policy people_insert_owner_admin on public.people for insert to authenticated
  with check (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));
create policy people_update_owner_admin on public.people for update to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]))
  with check (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));
create policy people_delete_owner_admin on public.people for delete to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));

-- invitations (raw token never readable; only metadata)
create policy invitations_select_owner_admin on public.invitations for select to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));
create policy invitations_revoke_owner_admin on public.invitations for update to authenticated
  using (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]))
  with check (app_private.has_tenant_role(tenant_id, array['owner','admin']::public.app_role[]));

-- audit events
create policy audit_select_member on public.audit_events for select to authenticated
  using (tenant_id is not null and app_private.is_tenant_member(tenant_id));

-- idempotency ledger
create policy idempotency_select_self on public.idempotency_keys for select to authenticated
  using (actor_profile_id = auth.uid());

-- =============== guards: self-elevation and last owner ===============
create or replace function public.guard_membership_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _owner_count int;
begin
  if tg_op = 'UPDATE' then
    if new.profile_id = auth.uid() and (new.role is distinct from old.role) then
      raise exception 'A member cannot change their own role';
    end if;
    if new.tenant_id is distinct from old.tenant_id or new.profile_id is distinct from old.profile_id then
      raise exception 'Membership cannot be reassigned';
    end if;
  end if;

  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner'
         and (new.role is distinct from 'owner' or new.status is distinct from 'active')) then
    select count(*) into _owner_count
      from public.memberships m
      where m.tenant_id = old.tenant_id and m.role = 'owner' and m.status = 'active';
    if _owner_count <= 1 then
      raise exception 'The last owner of an organization cannot be removed or demoted';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger memberships_guard
  before update or delete on public.memberships
  for each row execute function public.guard_membership_change();

-- ==================== public SECURITY DEFINER API ====================

-- 1) ensure_profile -----------------------------------------------------
create or replace function public.ensure_profile(_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _email text;
  _profile public.profiles;
begin
  if _uid is null then
    raise exception 'Authentication required';
  end if;

  select u.email into _email from auth.users u where u.id = _uid;

  insert into public.profiles (id, email, display_name)
  values (_uid, _email, nullif(trim(coalesce(_display_name, '')), ''))
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        display_name = coalesce(public.profiles.display_name, excluded.display_name)
  returning * into _profile;

  return _profile;
end;
$$;

-- 2) bootstrap_tenant ---------------------------------------------------
create or replace function public.bootstrap_tenant(
  _name text,
  _slug text,
  _country_code text default 'BR',
  _default_locale text default 'pt-BR',
  _timezone text default 'America/Sao_Paulo',
  _currency_code text default 'BRL',
  _idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _key text := coalesce(nullif(trim(coalesce(_idempotency_key, '')), ''), gen_random_uuid()::text);
  _existing jsonb;
  _tenant public.tenants;
  _person_id uuid;
  _membership_id uuid;
  _display_name text;
begin
  if _uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.ensure_profile(null);

  select k.result into _existing
    from public.idempotency_keys k
    where k.actor_profile_id = _uid
      and k.action = 'tenant.bootstrap'
      and k.idempotency_key = _key;
  if _existing is not null then
    return _existing;
  end if;

  insert into public.tenants (slug, name, country_code, default_locale, timezone, currency_code, created_by)
  values (lower(trim(_slug)), trim(_name), upper(_country_code), _default_locale, _timezone, upper(_currency_code), _uid)
  returning * into _tenant;

  insert into public.memberships (tenant_id, profile_id, role, status)
  values (_tenant.id, _uid, 'owner', 'active')
  returning id into _membership_id;

  select coalesce(p.display_name, p.email, 'Owner') into _display_name
    from public.profiles p where p.id = _uid;

  insert into public.people (tenant_id, profile_id, full_name, email, preferred_locale)
  select _tenant.id, _uid, _display_name, p.email, _default_locale
    from public.profiles p where p.id = _uid
  returning id into _person_id;

  perform app_private.record_audit_event(
    _tenant.id, _uid, 'tenant.bootstrapped', 'tenant', _tenant.id, _key,
    jsonb_build_object('slug', _tenant.slug, 'membership_id', _membership_id, 'person_id', _person_id)
  );

  _existing := jsonb_build_object(
    'tenant_id', _tenant.id,
    'slug', _tenant.slug,
    'membership_id', _membership_id,
    'person_id', _person_id
  );

  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_tenant.id, _uid, 'tenant.bootstrap', _key, _existing);

  return _existing;
end;
$$;

-- 3) create_invitation --------------------------------------------------
-- The RAW token is generated client-side per user intent (Web Crypto),
-- sent once, validated for entropy, hashed here, and never persisted.
-- A replay with the same idempotency key returns the same invitation id,
-- and the client still holds the raw token for the shareable link.
create or replace function public.create_invitation(
  _tenant_id uuid,
  _email text,
  _role public.app_role,
  _token text,
  _idempotency_key text,
  _ttl_hours int default 168
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
  _hash text;
  _invitation public.invitations;
  _normalized_email text := lower(trim(_email));
begin
  if _uid is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.has_tenant_role(_tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins can invite';
  end if;
  if _key is null then
    raise exception 'Idempotency key is required';
  end if;
  if _token is null or _token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitation token must be 256 bits of hex-encoded entropy';
  end if;
  if _normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email address is required';
  end if;
  if _role = 'owner' and not app_private.has_tenant_role(_tenant_id, array['owner']::public.app_role[]) then
    raise exception 'Only owners can invite owners';
  end if;
  if _ttl_hours is null or _ttl_hours < 1 or _ttl_hours > 720 then
    raise exception 'Invalid invitation lifetime';
  end if;

  select k.result into _existing
    from public.idempotency_keys k
    where k.actor_profile_id = _uid
      and k.action = 'invitation.create'
      and k.idempotency_key = _key;
  if _existing is not null then
    return _existing;
  end if;

  _hash := encode(sha256(convert_to(_token, 'utf8')), 'hex');

  insert into public.invitations
    (tenant_id, email, role, token_hash, expires_at, invited_by_profile_id)
  values
    (_tenant_id, _normalized_email, _role, _hash, now() + make_interval(hours => _ttl_hours), _uid)
  returning * into _invitation;

  -- PII minimization: the invitee email lives only on the invitation row.
  perform app_private.record_audit_event(
    _tenant_id, _uid, 'invitation.created', 'invitation', _invitation.id, _key,
    jsonb_build_object('intended_role', _role)
  );

  _existing := jsonb_build_object(
    'invitation_id', _invitation.id,
    'tenant_id', _tenant_id,
    'role', _role,
    'expires_at', _invitation.expires_at
  );

  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_tenant_id, _uid, 'invitation.create', _key, _existing);

  return _existing;
end;
$$;

-- 4) accept_invitation --------------------------------------------------
create or replace function public.accept_invitation(_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _hash text;
  _inv public.invitations;
  _email text;
  _person_id uuid;
  _membership_id uuid;
  _display_name text;
begin
  if _uid is null then
    raise exception 'Authentication required';
  end if;
  if _token is null or _token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation link';
  end if;

  perform public.ensure_profile(null);
  select u.email into _email from auth.users u where u.id = _uid;

  _hash := encode(sha256(convert_to(_token, 'utf8')), 'hex');

  select * into _inv from public.invitations i where i.token_hash = _hash for update;
  if _inv.id is null then
    raise exception 'Invalid invitation link';
  end if;
  if _inv.status <> 'pending' then
    -- replay-safe: already accepted by this same identity is a no-op success
    if _inv.status = 'accepted' and _inv.accepted_by_profile_id = _uid then
      select m.id into _membership_id from public.memberships m
        where m.tenant_id = _inv.tenant_id and m.profile_id = _uid;
      return jsonb_build_object('tenant_id', _inv.tenant_id, 'membership_id', _membership_id, 'replayed', true);
    end if;
    raise exception 'This invitation has already been used';
  end if;
  if _inv.expires_at <= now() then
    raise exception 'This invitation has expired';
  end if;
  if lower(coalesce(_email, '')) <> lower(_inv.email) then
    raise exception 'This invitation was issued to a different email address';
  end if;

  select coalesce(p.display_name, p.email, 'Member') into _display_name
    from public.profiles p where p.id = _uid;

  -- Person reuse: match the tenant-scoped human by email, never duplicate.
  select pe.id into _person_id from public.people pe
    where pe.tenant_id = _inv.tenant_id and lower(pe.email) = lower(_inv.email);

  if _person_id is null then
    select pe.id into _person_id from public.people pe
      where pe.tenant_id = _inv.tenant_id and pe.profile_id = _uid;
  end if;

  if _person_id is null then
    insert into public.people (tenant_id, profile_id, full_name, email)
    values (_inv.tenant_id, _uid, _display_name, _inv.email)
    returning id into _person_id;
  else
    update public.people
      set profile_id = coalesce(profile_id, _uid)
      where id = _person_id;
  end if;

  insert into public.memberships (tenant_id, profile_id, role, status)
  values (_inv.tenant_id, _uid, _inv.role, 'active')
  on conflict (tenant_id, profile_id) do update set status = 'active'
  returning id into _membership_id;

  update public.invitations
    set status = 'accepted', accepted_at = now(), accepted_by_profile_id = _uid
    where id = _inv.id;

  perform app_private.record_audit_event(
    _inv.tenant_id, _uid, 'invitation.accepted', 'invitation', _inv.id, null,
    jsonb_build_object('granted_role', _inv.role, 'person_id', _person_id)
  );

  return jsonb_build_object(
    'tenant_id', _inv.tenant_id,
    'membership_id', _membership_id,
    'person_id', _person_id,
    'replayed', false
  );
end;
$$;

-- 5) link_person_to_profile --------------------------------------------
create or replace function public.link_person_to_profile(
  _tenant_id uuid,
  _person_id uuid,
  _profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _uid uuid := auth.uid();
  _person public.people;
  _conflict uuid;
begin
  if _uid is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.has_tenant_role(_tenant_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Only owners and admins can link people to accounts';
  end if;

  select * into _person from public.people p
    where p.id = _person_id and p.tenant_id = _tenant_id for update;
  if _person.id is null then
    raise exception 'Person not found in this organization';
  end if;

  if not exists (select 1 from public.memberships m
                 where m.tenant_id = _tenant_id and m.profile_id = _profile_id) then
    raise exception 'That account is not a member of this organization';
  end if;

  select p.id into _conflict from public.people p
    where p.tenant_id = _tenant_id and p.profile_id = _profile_id and p.id <> _person_id;
  if _conflict is not null then
    raise exception 'That account is already linked to another person in this organization';
  end if;

  update public.people set profile_id = _profile_id where id = _person_id;

  perform app_private.record_audit_event(
    _tenant_id, _uid, 'person.linked_to_profile', 'person', _person_id, null,
    jsonb_build_object('profile_id', _profile_id)
  );

  return jsonb_build_object('person_id', _person_id, 'profile_id', _profile_id);
end;
$$;

-- ------------------------------ grants --------------------------------
revoke all on function public.ensure_profile(text) from public, anon;
revoke all on function public.bootstrap_tenant(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.create_invitation(uuid, text, public.app_role, text, text, int) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.link_person_to_profile(uuid, uuid, uuid) from public, anon;

grant execute on function public.ensure_profile(text) to authenticated;
grant execute on function public.bootstrap_tenant(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.app_role, text, text, int) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.link_person_to_profile(uuid, uuid, uuid) to authenticated;
