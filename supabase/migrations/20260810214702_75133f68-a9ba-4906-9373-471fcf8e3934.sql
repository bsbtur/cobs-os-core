create or replace function public.accept_participant_access_invitation(_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare _uid uuid := auth.uid(); _hash text; _inv public.participant_access_invitations;
        _person public.people; _part public.operation_participations; _grant uuid;
        _other uuid;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _token is null or _token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid or expired invitation';
  end if;
  _hash := app_private.w10_hash_invitation_token(_token);

  select * into _inv from public.participant_access_invitations
   where token_hash = _hash for update;
  if _inv.id is null then raise exception 'Invalid or expired invitation'; end if;

  if _inv.accepted_at is not null then
    if _inv.accepted_profile_id = _uid then
      select g.id into _grant from public.participant_access_grants g
       where g.operation_id = _inv.operation_id and g.person_id = _inv.person_id;
      return jsonb_build_object('grant_id', _grant, 'operation_id', _inv.operation_id,
                                'replayed', true);
    end if;
    raise exception 'Invalid or expired invitation';
  end if;
  if _inv.revoked_at is not null or _inv.expires_at <= now() then
    raise exception 'Invalid or expired invitation';
  end if;

  select * into _person from public.people
   where id = _inv.person_id and tenant_id = _inv.tenant_id for update;
  if _person.id is null then raise exception 'Invalid or expired invitation'; end if;

  if _person.profile_id is not null and _person.profile_id <> _uid then
    raise exception 'Invalid or expired invitation';
  end if;
  if _person.profile_id is null then
    select p.id into _other from public.people p
     where p.tenant_id = _inv.tenant_id and p.profile_id = _uid and p.id <> _person.id
     limit 1;
    if _other is not null then
      raise exception 'Invalid or expired invitation';
    end if;
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
end; $function$;