CREATE OR REPLACE FUNCTION public.create_invitation(_tenant_id uuid, _email text, _role app_role, _token text, _idempotency_key text, _ttl_hours integer DEFAULT 168)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

  -- Stale pending invitations must not permanently block a re-invite.
  update public.invitations i
    set status = 'revoked'
    where i.tenant_id = _tenant_id
      and lower(i.email) = _normalized_email
      and i.status = 'pending'
      and i.expires_at <= now();

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
$function$;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;