create or replace function public.guard_membership_change()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _owner_count int;
  _actor_is_owner boolean := false;
begin
  if auth.uid() is not null then
    _actor_is_owner := app_private.has_tenant_role(
      case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end,
      array['owner']::public.app_role[]
    );
  end if;

  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id or new.profile_id is distinct from old.profile_id then
      raise exception 'Membership cannot be reassigned';
    end if;

    if new.profile_id = auth.uid() and (new.role is distinct from old.role) then
      raise exception 'A member cannot change their own role';
    end if;

    if (new.role = 'owner' and old.role is distinct from 'owner') and not _actor_is_owner then
      raise exception 'Only an owner can promote a member to owner';
    end if;

    if old.role = 'owner' and (
         new.role is distinct from old.role
         or new.status is distinct from old.status
       ) and not _actor_is_owner then
      raise exception 'Only an owner can change another owner membership';
    end if;
  end if;

  if tg_op = 'DELETE' and old.role = 'owner' and not _actor_is_owner then
    raise exception 'Only an owner can remove another owner membership';
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
$function$;

create or replace function public.accept_invitation(_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _hash text;
  _inv public.invitations;
  _email text;
  _person_id uuid;
  _membership_id uuid;
  _display_name text;
  _existing_membership public.memberships;
  _inviter_is_owner boolean := false;
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
  if _inv.status = 'revoked' then
    raise exception 'This invitation was cancelled';
  end if;
  if _inv.status <> 'pending' then
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

  select * into _existing_membership
  from public.memberships m
  where m.tenant_id = _inv.tenant_id and m.profile_id = _uid
  for update;

  if _existing_membership.id is not null and _existing_membership.role = 'owner' and _inv.role <> 'owner' then
    select exists (
      select 1 from public.memberships m
      where m.tenant_id = _inv.tenant_id
        and m.profile_id = _inv.invited_by_profile_id
        and m.status = 'active'
        and m.role = 'owner'
    ) into _inviter_is_owner;

    if not _inviter_is_owner then
      raise exception 'An owner membership can only be reactivated through an owner-issued owner invitation';
    end if;

    raise exception 'This account has an existing owner membership; issue an owner invitation to reactivate it';
  end if;

  if _existing_membership.id is not null and _inv.role = 'owner' then
    select exists (
      select 1 from public.memberships m
      where m.tenant_id = _inv.tenant_id
        and m.profile_id = _inv.invited_by_profile_id
        and m.status = 'active'
        and m.role = 'owner'
    ) into _inviter_is_owner;
    if not _inviter_is_owner then
      raise exception 'Only an owner-issued invitation can reactivate or grant owner access';
    end if;
  end if;

  select coalesce(p.display_name, p.email, 'Member') into _display_name
    from public.profiles p where p.id = _uid;

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
  on conflict (tenant_id, profile_id) do update
    set status = 'active',
        role = case
          when public.memberships.role = 'owner' then public.memberships.role
          else excluded.role
        end
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
$function$;