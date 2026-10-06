-- One-time, guarded identity repair for the Team Seffrin traveler E2E.
-- Removes the stale HIAGO QA portal binding from Rafael's account, revokes the
-- legacy CIOSP grant, and binds the existing account to the canonical Rafael
-- Person. The pending Team Seffrin invitation is intentionally left untouched.
--
-- This migration is idempotent: if the repaired state is already present it
-- performs no mutation. Any unexpected partial state aborts.

do $$
declare
  _tenant uuid := 'bb25410b-4c7a-4d4c-965c-ee43d7084068';
  _profile uuid := '28384747-f56a-46c2-9328-a8b5d27ac009';
  _legacy_person uuid := 'a636b8bd-2bec-4859-b068-567494001684';
  _target_person uuid := '5e0a11ef-94ba-46e8-87e6-570d69addce8';
  _team_operation uuid := 'b207edae-7293-4d57-b994-5a442a1fad89';
  _team_participation uuid := '25e03ab0-8ac8-41ae-b205-97f8bd8a7332';
  _legacy_profile uuid;
  _target_profile uuid;
  _grant record;
begin
  select profile_id into _legacy_profile
  from public.people
  where id=_legacy_person and tenant_id=_tenant
  for update;

  select profile_id into _target_profile
  from public.people
  where id=_target_person and tenant_id=_tenant
  for update;

  if _legacy_profile is null and _target_profile = _profile then
    return;
  end if;

  if _legacy_profile is distinct from _profile or _target_profile is not null then
    raise exception 'Identity repair preconditions are not satisfied';
  end if;

  perform 1
  from public.operation_participations
  where id=_team_participation
    and tenant_id=_tenant
    and operation_id=_team_operation
    and person_id=_target_person
    and status='confirmed';
  if not found then
    raise exception 'Team Seffrin participation is not confirmed as expected';
  end if;

  perform 1
  from public.participant_access_invitations
  where tenant_id=_tenant
    and operation_id=_team_operation
    and person_id=_target_person
    and participation_id=_team_participation
    and accepted_at is null
    and revoked_at is null
    and expires_at > now();
  if not found then
    raise exception 'Expected pending Team Seffrin portal invitation was not found';
  end if;

  perform set_config('app.w10_control','on',true);

  for _grant in
    select id, operation_id
    from public.participant_access_grants
    where tenant_id=_tenant
      and person_id=_legacy_person
      and profile_id=_profile
      and status='active'
      and revoked_at is null
    for update
  loop
    update public.participant_access_grants
       set status='revoked',
           revoked_at=now(),
           revoked_by=null,
           revoked_reason='legacy_qa_identity_repair_before_team_seffrin_claim',
           updated_at=now()
     where id=_grant.id;

    perform app_private.record_audit_event(
      _tenant,
      null,
      'participant_access.revoked_identity_repair',
      'participant_access_grant',
      _grant.id,
      'team-seffrin-e2e-identity-repair',
      jsonb_build_object(
        'operation_id', _grant.operation_id,
        'legacy_person_id', _legacy_person,
        'profile_id', _profile,
        'reason', 'legacy_qa_identity_repair_before_team_seffrin_claim'
      )
    );
  end loop;

  update public.people
     set profile_id=null, updated_at=now()
   where id=_legacy_person and tenant_id=_tenant and profile_id=_profile;

  perform app_private.record_audit_event(
    _tenant,
    null,
    'person.profile_unlinked_identity_repair',
    'person',
    _legacy_person,
    'team-seffrin-e2e-identity-repair',
    jsonb_build_object('profile_id',_profile,'reason','legacy_qa_identity_repair')
  );

  update public.people
     set profile_id=_profile, updated_at=now()
   where id=_target_person and tenant_id=_tenant and profile_id is null;

  if not found then
    raise exception 'Failed to bind target Rafael person to the traveler profile';
  end if;

  perform app_private.record_audit_event(
    _tenant,
    null,
    'person.profile_linked_identity_repair',
    'person',
    _target_person,
    'team-seffrin-e2e-identity-repair',
    jsonb_build_object('profile_id',_profile,'reason','team_seffrin_e2e_identity_repair')
  );

  perform set_config('app.w10_control','off',true);
end
$$;
