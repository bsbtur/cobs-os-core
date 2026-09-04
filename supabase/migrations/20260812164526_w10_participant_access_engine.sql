-- =====================================================================
-- COBS OS · W10-B — ACCESS ENGINE
-- 9 private helpers · 6 mutating commands. Additive only.
-- =====================================================================

-- Keep the frozen helper count at exactly 9: policies use the W01 helper.
drop policy "w10 operators read grants" on public.participant_access_grants;
drop policy "w10 operators read invitations" on public.participant_access_invitations;

create policy "w10 operators read grants"
  on public.participant_access_grants for select
  to authenticated
  using (app_private.has_tenant_role(
           tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

create policy "w10 operators read invitations"
  on public.participant_access_invitations for select
  to authenticated
  using (app_private.has_tenant_role(
           tenant_id, array['owner','admin','operations_agent']::public.app_role[]));

drop function if exists app_private.w10_is_access_operator(uuid);

-- ============================================================ HELPER 1
create or replace function app_private.w10_current_person_id(_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
  select p.id from public.people p
   where p.tenant_id = _tenant_id and p.profile_id = auth.uid()
   limit 1
$$;

-- ============================================================ HELPER 3
create or replace function app_private.w10_tenant_of_operation(_operation_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
  select o.tenant_id from public.operations o where o.id = _operation_id
$$;

-- ============================================================ HELPER 4
create or replace function app_private.w10_assert_person_profile_link(_tenant_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
declare _person uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  _person := app_private.w10_current_person_id(_tenant_id);
  if _person is null then
    raise exception 'Access denied';
  end if;
  return _person;
end; $$;

-- ============================================================ HELPER 5
-- THE formula. Returns null when access is not effective. Never raises.
create or replace function app_private.w10_effective_access(_operation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
  select jsonb_build_object(
           'grant_id',         g.id,
           'tenant_id',        g.tenant_id,
           'operation_id',     g.operation_id,
           'person_id',        g.person_id,
           'participation_id', g.participation_id,
           'operation_status', o.status,
           'historical',       (o.status = 'completed' or o.archived_at is not null)
         )
    from public.participant_access_grants g
    join public.people p
      on p.id = g.person_id
     and p.tenant_id = g.tenant_id
    join public.operation_participations pa
      on pa.id = g.participation_id
     and pa.tenant_id = g.tenant_id
    join public.operations o
      on o.id = g.operation_id
     and o.tenant_id = g.tenant_id
   where g.operation_id = _operation_id
     and g.status = 'active'
     and auth.uid() is not null
     and g.profile_id = auth.uid()          -- immutable binding snapshot
     and p.profile_id = auth.uid()          -- identity link still holds today
     and pa.person_id = g.person_id         -- participation identity assertion
     and pa.operation_id = g.operation_id
     and pa.status in ('expected','confirmed')
     and o.status <> 'cancelled'
   limit 1
$$;

-- ============================================================ HELPER 6
create or replace function app_private.w10_assert_effective_access(_operation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
as $$
declare _ctx jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  _ctx := app_private.w10_effective_access(_operation_id);
  if _ctx is null then
    -- uniform denial: never reveals whether the operation exists
    raise exception 'Access denied';
  end if;
  return _ctx;
end; $$;

-- ============================================================ HELPER 7
create or replace function app_private.w10_generate_invitation_token()
returns text
language sql
volatile
security definer
set search_path to 'pg_catalog','public','extensions'
as $$
  select encode(extensions.gen_random_bytes(32), 'hex')   -- 256 bits CSPRNG
$$;

-- ============================================================ HELPER 8
create or replace function app_private.w10_hash_invitation_token(_token text)
returns text
language sql
immutable
security definer
set search_path to 'pg_catalog','public','extensions'
as $$
  select encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex')
$$;

-- ============================================================ HELPER 9
create or replace function app_private.w10_record_access_audit(
  _tenant_id uuid, _action text, _subject_id uuid, _metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
volatile
security definer
set search_path to 'pg_catalog','public'
as $$
begin
  -- defense in depth: a token can never reach the audit trail
  if _metadata ? 'token' or _metadata ? 'token_hash' then
    raise exception 'Credentials must never be audited';
  end if;
  perform app_private.record_audit_event(
    _tenant_id, auth.uid(), _action, 'participant_access', _subject_id, null, _metadata);
end; $$;

-- private helpers are unreachable as client RPC
revoke all on function app_private.w10_current_person_id(uuid) from public;
revoke all on function app_private.w10_tenant_of_operation(uuid) from public;
revoke all on function app_private.w10_assert_person_profile_link(uuid) from public;
revoke all on function app_private.w10_effective_access(uuid) from public;
revoke all on function app_private.w10_assert_effective_access(uuid) from public;
revoke all on function app_private.w10_generate_invitation_token() from public;
revoke all on function app_private.w10_hash_invitation_token(text) from public;
revoke all on function app_private.w10_record_access_audit(uuid, text, uuid, jsonb) from public;

-- =====================================================================
-- MUTATING COMMANDS (6)
-- =====================================================================

-- ---------------------------------------------------------- COMMAND 1
create or replace function public.invite_participant_access(
  _operation_id uuid,
  _person_id uuid,
  _ttl_hours integer default 168,
  _idempotency_key text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare _tenant uuid; _part public.operation_participations; _token text; _hash text;
        _id uuid; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
        _existing jsonb; _expires timestamptz;
begin
  _tenant := app_private.w10_tenant_of_operation(_operation_id);
  if _tenant is null then raise exception 'Operation not found'; end if;
  perform app_private.w10_require_access_operator(_tenant);

  if _ttl_hours is null or _ttl_hours < 1 or _ttl_hours > 720 then
    raise exception 'Invalid invitation lifetime';
  end if;

  if _key is not null then
    select k.result into _existing from public.idempotency_keys k
     where k.actor_profile_id = auth.uid()
       and k.action = 'participant_access.invite'
       and k.idempotency_key = _key;
    if _existing is not null then
      -- replay never re-issues a credential
      return _existing || jsonb_build_object('token', null, 'replayed', true);
    end if;
  end if;

  select * into _part from public.operation_participations p
   where p.operation_id = _operation_id and p.person_id = _person_id
     and p.tenant_id = _tenant;
  if _part.id is null then
    raise exception 'This person is not on the roster for this operation';
  end if;
  if _part.status = 'cancelled' then
    raise exception 'A cancelled participation cannot receive portal access';
  end if;
  if exists (select 1 from public.operations o
              where o.id = _operation_id and o.status in ('cancelled','completed')) then
    raise exception 'Portal access cannot be invited for a terminal operation';
  end if;
  if exists (select 1 from public.participant_access_grants g
              where g.operation_id = _operation_id and g.person_id = _person_id
                and g.status = 'active') then
    raise exception 'This person already has active portal access to this operation';
  end if;

  _token := app_private.w10_generate_invitation_token();
  _hash  := app_private.w10_hash_invitation_token(_token);
  _expires := now() + make_interval(hours => _ttl_hours);

  perform set_config('app.w10_control','on', true);
  -- supersede any open invitation for the same scope
  update public.participant_access_invitations i
     set revoked_at = now(), revoked_by = auth.uid(),
         revoked_reason = 'Superseded by a new invitation'
   where i.operation_id = _operation_id and i.person_id = _person_id
     and i.accepted_at is null and i.revoked_at is null;

  insert into public.participant_access_invitations
    (tenant_id, operation_id, person_id, participation_id, token_hash, expires_at, created_by)
  values (_tenant, _operation_id, _person_id, _part.id, _hash, _expires, auth.uid())
  returning id into _id;
  perform set_config('app.w10_control','off', true);

  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_tenant, auth.uid(), 'participant_access.invite', _key,
            jsonb_build_object('invitation_id', _id, 'expires_at', _expires));
  end if;

  perform app_private.w10_record_access_audit(_tenant, 'participant_access.invited', _id,
    jsonb_build_object('operation_id', _operation_id, 'person_id', _person_id,
                       'expires_at', _expires));

  -- the plaintext token is returned exactly once, here, and nowhere else
  return jsonb_build_object('invitation_id', _id, 'token', _token,
                            'expires_at', _expires, 'replayed', false);
end; $$;

-- ---------------------------------------------------------- COMMAND 2
create or replace function public.revoke_participant_access_invitation(
  _invitation_id uuid, _reason text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare _inv public.participant_access_invitations;
        _r text := nullif(btrim(coalesce(_reason,'')),'');
begin
  if _r is null then raise exception 'A revocation reason is required'; end if;
  select * into _inv from public.participant_access_invitations
   where id = _invitation_id;
  if _inv.id is null then raise exception 'Invitation not found'; end if;
  perform app_private.w10_require_access_operator(_inv.tenant_id);
  if _inv.accepted_at is not null then
    raise exception 'An accepted invitation cannot be revoked; revoke the access grant instead';
  end if;
  if _inv.revoked_at is not null then return false; end if;

  perform set_config('app.w10_control','on', true);
  update public.participant_access_invitations
     set revoked_at = now(), revoked_by = auth.uid(), revoked_reason = left(_r, 500)
   where id = _invitation_id;
  perform set_config('app.w10_control','off', true);

  perform app_private.w10_record_access_audit(_inv.tenant_id,
    'participant_access.invitation_revoked', _invitation_id,
    jsonb_build_object('operation_id', _inv.operation_id, 'reason', left(_r, 500)));
  return true;
end; $$;

-- ---------------------------------------------------------- COMMAND 3
create or replace function public.accept_participant_access_invitation(_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare _uid uuid := auth.uid(); _hash text; _inv public.participant_access_invitations;
        _person public.people; _part public.operation_participations; _grant uuid;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _token is null or _token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid or expired invitation';
  end if;
  _hash := app_private.w10_hash_invitation_token(_token);

  select * into _inv from public.participant_access_invitations
   where token_hash = _hash for update;
  if _inv.id is null then raise exception 'Invalid or expired invitation'; end if;

  -- idempotent replay by the SAME profile returns the existing grant
  if _inv.accepted_at is not null then
    if _inv.accepted_profile_id = _uid then
      select g.id into _grant from public.participant_access_grants g
       where g.operation_id = _inv.operation_id and g.person_id = _inv.person_id;
      return jsonb_build_object('grant_id', _grant, 'operation_id', _inv.operation_id,
                                'replayed', true);
    end if;
    raise exception 'Invalid or expired invitation';   -- use-after-claim by another login
  end if;
  if _inv.revoked_at is not null or _inv.expires_at <= now() then
    raise exception 'Invalid or expired invitation';
  end if;

  select * into _person from public.people
   where id = _inv.person_id and tenant_id = _inv.tenant_id for update;
  if _person.id is null then raise exception 'Invalid or expired invitation'; end if;

  -- NEVER overwrite an existing link; only fill a null one
  if _person.profile_id is not null and _person.profile_id <> _uid then
    raise exception 'Invalid or expired invitation';
  end if;
  if _person.profile_id is null then
    perform public.ensure_profile(null);
    update public.people set profile_id = _uid where id = _person.id;
  end if;

  select * into _part from public.operation_participations
   where id = _inv.participation_id and tenant_id = _inv.tenant_id;
  if _part.id is null or _part.person_id <> _inv.person_id
     or _part.operation_id <> _inv.operation_id then
    raise exception 'Invalid or expired invitation';
  end if;
  if _part.status = 'cancelled' then
    raise exception 'This participation is no longer active';
  end if;

  perform set_config('app.w10_control','on', true);
  update public.participant_access_invitations
     set accepted_at = now(), accepted_profile_id = _uid
   where id = _inv.id;

  insert into public.participant_access_grants
    (tenant_id, operation_id, person_id, participation_id, profile_id, status, origin, granted_by)
  values (_inv.tenant_id, _inv.operation_id, _inv.person_id, _inv.participation_id,
          _uid, 'active', 'invitation_claim', _inv.created_by)
  on conflict (operation_id, person_id) do update
     set status = 'active', revoked_at = null, revoked_by = null, revoked_reason = null,
         activated_at = now()
  returning id into _grant;
  perform set_config('app.w10_control','off', true);

  perform app_private.w10_record_access_audit(_inv.tenant_id,
    'participant_access.claim_accepted', _grant,
    jsonb_build_object('operation_id', _inv.operation_id, 'invitation_id', _inv.id));

  return jsonb_build_object('grant_id', _grant, 'operation_id', _inv.operation_id,
                            'replayed', false);
end; $$;

-- ---------------------------------------------------------- COMMAND 4
create or replace function public.grant_participant_access(
  _operation_id uuid, _person_id uuid, _idempotency_key text default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare _tenant uuid; _person public.people; _part public.operation_participations;
        _id uuid; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
        _existing jsonb;
begin
  _tenant := app_private.w10_tenant_of_operation(_operation_id);
  if _tenant is null then raise exception 'Operation not found'; end if;
  perform app_private.w10_require_access_operator(_tenant);

  if _key is not null then
    select k.result into _existing from public.idempotency_keys k
     where k.actor_profile_id = auth.uid()
       and k.action = 'participant_access.grant'
       and k.idempotency_key = _key;
    if _existing is not null then return (_existing->>'grant_id')::uuid; end if;
  end if;

  select * into _person from public.people where id = _person_id and tenant_id = _tenant;
  if _person.id is null then raise exception 'Person not found in this organization'; end if;
  if _person.profile_id is null then
    raise exception 'This person has no login yet; send a participant invitation instead';
  end if;

  select * into _part from public.operation_participations p
   where p.operation_id = _operation_id and p.person_id = _person_id and p.tenant_id = _tenant;
  if _part.id is null then
    raise exception 'This person is not on the roster for this operation';
  end if;
  if _part.status = 'cancelled' then
    raise exception 'A cancelled participation cannot receive portal access';
  end if;
  if exists (select 1 from public.operations o
              where o.id = _operation_id and o.status = 'cancelled') then
    raise exception 'Portal access cannot be granted for a cancelled operation';
  end if;

  select g.id into _id from public.participant_access_grants g
   where g.operation_id = _operation_id and g.person_id = _person_id;

  perform set_config('app.w10_control','on', true);
  if _id is null then
    insert into public.participant_access_grants
      (tenant_id, operation_id, person_id, participation_id, profile_id,
       status, origin, granted_by)
    values (_tenant, _operation_id, _person_id, _part.id, _person.profile_id,
            'active', 'operator_grant', auth.uid())
    returning id into _id;
  else
    -- an existing grant keeps its immutable profile binding
    update public.participant_access_grants
       set status = 'active', revoked_at = null, revoked_by = null,
           revoked_reason = null, activated_at = now()
     where id = _id and status = 'revoked';
  end if;
  perform set_config('app.w10_control','off', true);

  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_tenant, auth.uid(), 'participant_access.grant', _key,
            jsonb_build_object('grant_id', _id));
  end if;

  perform app_private.w10_record_access_audit(_tenant, 'participant_access.granted', _id,
    jsonb_build_object('operation_id', _operation_id, 'person_id', _person_id));
  return _id;
end; $$;

-- ---------------------------------------------------------- COMMAND 5
create or replace function public.revoke_participant_access(_grant_id uuid, _reason text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare _g public.participant_access_grants; _r text := nullif(btrim(coalesce(_reason,'')),'');
begin
  if _r is null then raise exception 'A revocation reason is required'; end if;
  select * into _g from public.participant_access_grants where id = _grant_id;
  if _g.id is null then raise exception 'Access grant not found'; end if;
  perform app_private.w10_require_access_operator(_g.tenant_id);
  if _g.status = 'revoked' then return false; end if;

  perform set_config('app.w10_control','on', true);
  update public.participant_access_grants
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
         revoked_reason = left(_r, 500)
   where id = _grant_id;
  perform set_config('app.w10_control','off', true);

  perform app_private.w10_record_access_audit(_g.tenant_id, 'participant_access.revoked',
    _grant_id, jsonb_build_object('operation_id', _g.operation_id,
                                  'person_id', _g.person_id, 'reason', left(_r, 500)));
  return true;
end; $$;

-- ---------------------------------------------------------- COMMAND 6
create or replace function public.reinstate_participant_access(_grant_id uuid, _reason text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare _g public.participant_access_grants; _r text := nullif(btrim(coalesce(_reason,'')),'');
        _link uuid;
begin
  if _r is null then raise exception 'A reinstatement reason is required'; end if;
  select * into _g from public.participant_access_grants where id = _grant_id;
  if _g.id is null then raise exception 'Access grant not found'; end if;
  perform app_private.w10_require_access_operator(_g.tenant_id);
  if _g.status = 'active' then return false; end if;

  select p.profile_id into _link from public.people p
   where p.id = _g.person_id and p.tenant_id = _g.tenant_id;
  if _link is null or _link <> _g.profile_id then
    raise exception 'The original login is no longer linked to this person; issue a new invitation';
  end if;

  perform set_config('app.w10_control','on', true);
  update public.participant_access_grants
     set status = 'active', revoked_at = null, revoked_by = null,
         revoked_reason = null, activated_at = now()
   where id = _grant_id;
  perform set_config('app.w10_control','off', true);

  perform app_private.w10_record_access_audit(_g.tenant_id, 'participant_access.reinstated',
    _grant_id, jsonb_build_object('operation_id', _g.operation_id, 'reason', left(_r, 500)));
  return true;
end; $$;

-- ACLs: commands callable by signed-in users; anon holds nothing.
revoke all on function public.invite_participant_access(uuid, uuid, integer, text) from public, anon;
revoke all on function public.revoke_participant_access_invitation(uuid, text) from public, anon;
revoke all on function public.accept_participant_access_invitation(text) from public, anon;
revoke all on function public.grant_participant_access(uuid, uuid, text) from public, anon;
revoke all on function public.revoke_participant_access(uuid, text) from public, anon;
revoke all on function public.reinstate_participant_access(uuid, text) from public, anon;

grant execute on function public.invite_participant_access(uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.revoke_participant_access_invitation(uuid, text) to authenticated, service_role;
grant execute on function public.accept_participant_access_invitation(text) to authenticated, service_role;
grant execute on function public.grant_participant_access(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.revoke_participant_access(uuid, text) to authenticated, service_role;
grant execute on function public.reinstate_participant_access(uuid, text) to authenticated, service_role;
