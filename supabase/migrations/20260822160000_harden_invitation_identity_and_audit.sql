-- AUD: keep invitation acceptance identity-safe and make the audit event report
-- the membership role that is actually active after acceptance.

create or replace function public.accept_invitation(_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  _uid uuid := auth.uid();
  _hash text;
  _inv public.invitations;
  _email text;
  _person public.people;
  _person_id uuid;
  _membership_id uuid;
  _membership_role public.app_role;
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
  if _inv.status = 'revoked' then
    raise exception 'This invitation was cancelled';
  end if;
  if _inv.status <> 'pending' then
    if _inv.status = 'accepted' and _inv.accepted_by_profile_id = _uid then
      select m.id, m.role into _membership_id, _membership_role
        from public.memberships m
       where m.tenant_id = _inv.tenant_id and m.profile_id = _uid;
      return jsonb_build_object(
        'tenant_id', _inv.tenant_id,
        'membership_id', _membership_id,
        'role', _membership_role,
        'replayed', true
      );
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

  select pe.* into _person
    from public.people pe
   where pe.tenant_id = _inv.tenant_id
     and lower(pe.email) = lower(_inv.email)
   for update;

  if _person.id is null then
    select pe.* into _person
      from public.people pe
     where pe.tenant_id = _inv.tenant_id
       and pe.profile_id = _uid
     for update;
  end if;

  if _person.id is not null
     and _person.profile_id is not null
     and _person.profile_id <> _uid then
    raise exception 'This invitation conflicts with an existing account link';
  end if;

  if _person.id is null then
    insert into public.people (tenant_id, profile_id, full_name, email)
    values (_inv.tenant_id, _uid, _display_name, _inv.email)
    returning id into _person_id;
  else
    _person_id := _person.id;
    update public.people
       set profile_id = coalesce(profile_id, _uid)
     where id = _person_id;
  end if;

  insert into public.memberships (tenant_id, profile_id, role, status)
  values (_inv.tenant_id, _uid, _inv.role, 'active')
  on conflict (tenant_id, profile_id) do update
    set status = 'active'
  returning id, role into _membership_id, _membership_role;

  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_by_profile_id = _uid
   where id = _inv.id;

  perform app_private.record_audit_event(
    _inv.tenant_id,
    _uid,
    'invitation.accepted',
    'invitation',
    _inv.id,
    null,
    jsonb_build_object(
      'invited_role', _inv.role,
      'active_role', _membership_role,
      'person_id', _person_id
    )
  );

  return jsonb_build_object(
    'tenant_id', _inv.tenant_id,
    'membership_id', _membership_id,
    'person_id', _person_id,
    'role', _membership_role,
    'replayed', false
  );
end;
$function$;
