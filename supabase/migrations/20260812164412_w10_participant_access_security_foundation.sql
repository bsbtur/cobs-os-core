-- =====================================================================
-- COBS OS · W10-A — PARTICIPANT ACCESS · SECURITY FOUNDATION
-- Additive only. Zero W01-W09 objects modified.
-- =====================================================================

create type public.participant_access_status as enum ('active','revoked');
create type public.participant_access_grant_origin as enum ('operator_grant','invitation_claim');

-- ---------------------------------------------------------------- grants
create table public.participant_access_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  person_id uuid not null,
  participation_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status public.participant_access_status not null default 'active',
  origin public.participant_access_grant_origin not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_access_grants_identity_key unique (id, tenant_id),
  constraint participant_access_grants_unique unique (operation_id, person_id),
  constraint participant_access_grants_operation_fk
    foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id) on delete cascade,
  constraint participant_access_grants_person_fk
    foreign key (person_id, tenant_id)
    references public.people(id, tenant_id) on delete cascade,
  constraint participant_access_grants_participation_fk
    foreign key (participation_id, tenant_id)
    references public.operation_participations(id, tenant_id) on delete cascade,
  -- revocation evidence is mandatory and only exists in the revoked state
  constraint participant_access_grants_revocation_ck check (
    (status = 'active'  and revoked_at is null and revoked_reason is null and revoked_by is null)
    or
    (status = 'revoked' and revoked_at is not null
                        and revoked_reason is not null
                        and btrim(revoked_reason) <> ''
                        and length(revoked_reason) <= 500)
  )
);

create index participant_access_grants_profile_idx
  on public.participant_access_grants (profile_id, status);
create index participant_access_grants_operation_idx
  on public.participant_access_grants (operation_id, status);
create index participant_access_grants_tenant_idx
  on public.participant_access_grants (tenant_id, status);
create index participant_access_grants_participation_idx
  on public.participant_access_grants (participation_id);

comment on table public.participant_access_grants is
  'W10 · operation-scoped traveler access. Grants NO tenant authority and NO membership. '
  'profile_id is an IMMUTABLE binding snapshot: it is never auto-synced from people.profile_id.';
comment on column public.participant_access_grants.profile_id is
  'W10 LOCK · immutable while the grant exists. Divergence from people.profile_id fails CLOSED; '
  'the only remedy is explicit revoke + re-grant.';

-- ----------------------------------------------------------- invitations
create table public.participant_access_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id uuid not null,
  person_id uuid not null,
  participation_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_profile_id uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_access_invitations_identity_key unique (id, tenant_id),
  constraint participant_access_invitations_token_uq unique (token_hash),
  constraint participant_access_invitations_token_shape_ck
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint participant_access_invitations_operation_fk
    foreign key (operation_id, tenant_id)
    references public.operations(id, tenant_id) on delete cascade,
  constraint participant_access_invitations_person_fk
    foreign key (person_id, tenant_id)
    references public.people(id, tenant_id) on delete cascade,
  constraint participant_access_invitations_participation_fk
    foreign key (participation_id, tenant_id)
    references public.operation_participations(id, tenant_id) on delete cascade,
  -- an invitation is either open, accepted, or revoked. never two at once.
  constraint participant_access_invitations_terminal_ck check (
    not (accepted_at is not null and revoked_at is not null)
  ),
  constraint participant_access_invitations_accept_ck check (
    (accepted_at is null and accepted_profile_id is null)
    or (accepted_at is not null and accepted_profile_id is not null)
  ),
  constraint participant_access_invitations_revoke_ck check (
    (revoked_at is null and revoked_reason is null)
    or (revoked_at is not null and revoked_reason is not null
        and btrim(revoked_reason) <> '' and length(revoked_reason) <= 500)
  )
);

-- at most one OPEN invitation per (operation, person)
create unique index participant_access_invitations_open_uq
  on public.participant_access_invitations (operation_id, person_id)
  where accepted_at is null and revoked_at is null;

create index participant_access_invitations_tenant_idx
  on public.participant_access_invitations (tenant_id);
create index participant_access_invitations_operation_idx
  on public.participant_access_invitations (operation_id);

comment on table public.participant_access_invitations is
  'W10 · pre-grant claim stage. token_hash only: the plaintext token is a bearer credential, '
  'returned exactly once at creation and never persisted, logged, audited or re-retrievable.';

-- ================================================================= GRANTS
grant select on public.participant_access_grants to authenticated;
grant all    on public.participant_access_grants to service_role;
grant select on public.participant_access_invitations to authenticated;
grant all    on public.participant_access_invitations to service_role;
-- anon: deliberately zero privileges on both tables.

-- ==================================================================== RLS
alter table public.participant_access_grants enable row level security;
alter table public.participant_access_invitations enable row level security;

-- helper: W10 access operators (operational, not financial)
create or replace function app_private.w10_require_access_operator(_tenant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.has_tenant_role(
        _tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'Only owners, admins and operations agents can manage participant access';
  end if;
end; $$;

create or replace function app_private.w10_is_access_operator(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
  select app_private.has_tenant_role(
    _tenant_id, array['owner','admin','operations_agent']::public.app_role[])
$$;

revoke all on function app_private.w10_require_access_operator(uuid) from public;
revoke all on function app_private.w10_is_access_operator(uuid) from public;
grant execute on function app_private.w10_is_access_operator(uuid)
  to authenticated, service_role;   -- minimum required for policy evaluation
grant execute on function app_private.w10_require_access_operator(uuid)
  to service_role;

create policy "w10 operators read grants"
  on public.participant_access_grants for select
  to authenticated
  using (app_private.w10_is_access_operator(tenant_id));

create policy "w10 participant reads own grant"
  on public.participant_access_grants for select
  to authenticated
  using (profile_id = auth.uid());

-- invitations are operator-only. a participant NEVER reads an invitation row.
create policy "w10 operators read invitations"
  on public.participant_access_invitations for select
  to authenticated
  using (app_private.w10_is_access_operator(tenant_id));

-- ================================================== guards (infrastructure)
create or replace function public.guard_w10_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
begin
  if coalesce(current_setting('app.w10_control', true), 'off') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Participant access can only change through the approved commands';
end; $$;

create trigger participant_access_grants_guard
  before insert or update or delete on public.participant_access_grants
  for each row execute function public.guard_w10_mutation();

create trigger participant_access_invitations_guard
  before insert or update or delete on public.participant_access_invitations
  for each row execute function public.guard_w10_mutation();

create trigger participant_access_grants_updated_at
  before update on public.participant_access_grants
  for each row execute function public.set_updated_at();

create trigger participant_access_invitations_updated_at
  before update on public.participant_access_invitations
  for each row execute function public.set_updated_at();

-- time-dependent validation lives in a trigger, never in a CHECK constraint
create or replace function public.guard_w10_invitation_validity()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.expires_at <= now() then
      raise exception 'Invitation expiry must be in the future';
    end if;
    if new.expires_at > now() + interval '30 days' then
      raise exception 'Invitation lifetime cannot exceed 30 days';
    end if;
    if new.accepted_at is not null or new.revoked_at is not null then
      raise exception 'An invitation cannot be created in a terminal state';
    end if;
  elsif tg_op = 'UPDATE' then
    -- credential fields and scope are immutable for the life of the invitation
    if new.token_hash is distinct from old.token_hash
       or new.tenant_id is distinct from old.tenant_id
       or new.operation_id is distinct from old.operation_id
       or new.person_id is distinct from old.person_id
       or new.participation_id is distinct from old.participation_id
       or new.expires_at is distinct from old.expires_at then
      raise exception 'Invitation scope and credential are immutable';
    end if;
    if old.accepted_at is not null and new.accepted_at is distinct from old.accepted_at then
      raise exception 'An accepted invitation is single-use and cannot be re-accepted';
    end if;
    if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
      raise exception 'An invitation revocation is final';
    end if;
  end if;
  return new;
end; $$;

create trigger participant_access_invitations_validity
  before insert or update on public.participant_access_invitations
  for each row execute function public.guard_w10_invitation_validity();

-- W10 LOCK: profile binding + participation identity are immutable on the grant
create or replace function public.guard_w10_grant_binding()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
declare _pperson uuid; _poperation uuid;
begin
  if tg_op = 'INSERT' then
    select p.person_id, p.operation_id into _pperson, _poperation
      from public.operation_participations p
     where p.id = new.participation_id and p.tenant_id = new.tenant_id;
    if _pperson is null then
      raise exception 'Participation not found in this organization';
    end if;
    if _pperson <> new.person_id or _poperation <> new.operation_id then
      raise exception 'Participation does not belong to this person and operation';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.profile_id is distinct from old.profile_id then
      raise exception 'Grant profile binding is immutable; revoke and re-grant instead';
    end if;
    if new.tenant_id is distinct from old.tenant_id
       or new.operation_id is distinct from old.operation_id
       or new.person_id is distinct from old.person_id
       or new.participation_id is distinct from old.participation_id
       or new.origin is distinct from old.origin
       or new.granted_at is distinct from old.granted_at then
      raise exception 'Grant scope is immutable';
    end if;
  elsif tg_op = 'DELETE' then
    raise exception 'Participant access grants are never hard-deleted';
  end if;
  return new;
end; $$;

create trigger participant_access_grants_binding
  before insert or update or delete on public.participant_access_grants
  for each row execute function public.guard_w10_grant_binding();
