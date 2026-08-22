create or replace function public.accept_participant_access_invitation(_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _uid uuid := auth.uid(); _hash text; _inv public.participant_access_invitations;
        _person public.people; _part public.operation_participations; _grant uuid;
        _other uuid; _op_status public.operation_status;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _token is null or _token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid or expired invitation'; end if;
  _hash := app_private.w10_hash_invitation_token(_token);
  select * into _inv from public.participant_access_invitations where token_hash = _hash for update;
  if _inv.id is null then raise exception 'Invalid or expired invitation'; end if;
  if _inv.accepted_at is not null then
    if _inv.accepted_profile_id = _uid then
      select g.id into _grant from public.participant_access_grants g where g.operation_id = _inv.operation_id and g.person_id = _inv.person_id;
      return jsonb_build_object('grant_id', _grant, 'operation_id', _inv.operation_id, 'replayed', true);
    end if;
    raise exception 'Invalid or expired invitation';
  end if;
  if _inv.revoked_at is not null or _inv.expires_at <= now() then raise exception 'Invalid or expired invitation'; end if;

  select o.status into _op_status from public.operations o where o.id = _inv.operation_id and o.tenant_id = _inv.tenant_id;
  if _op_status in ('completed','cancelled') then
    raise exception 'This operation no longer accepts new portal access';
  end if;

  select * into _person from public.people where id = _inv.person_id and tenant_id = _inv.tenant_id for update;
  if _person.id is null then raise exception 'Invalid or expired invitation'; end if;
  if _person.profile_id is not null and _person.profile_id <> _uid then raise exception 'Invalid or expired invitation'; end if;
  if _person.profile_id is null then
    select p.id into _other from public.people p where p.tenant_id = _inv.tenant_id and p.profile_id = _uid and p.id <> _person.id limit 1;
    if _other is not null then raise exception 'Invalid or expired invitation'; end if;
    perform public.ensure_profile(null);
    update public.people set profile_id = _uid where id = _person.id;
  end if;
  select * into _part from public.operation_participations where id = _inv.participation_id and tenant_id = _inv.tenant_id;
  if _part.id is null or _part.person_id <> _inv.person_id or _part.operation_id <> _inv.operation_id then raise exception 'Invalid or expired invitation'; end if;
  if _part.status = 'cancelled' then raise exception 'This participation is no longer active'; end if;
  perform set_config('app.w10_control','on', true);
  update public.participant_access_invitations set accepted_at = now(), accepted_profile_id = _uid where id = _inv.id;
  insert into public.participant_access_grants
    (tenant_id, operation_id, person_id, participation_id, profile_id, status, origin, granted_by)
  values (_inv.tenant_id, _inv.operation_id, _inv.person_id, _inv.participation_id, _uid, 'active', 'invitation_claim', _inv.created_by)
  on conflict (operation_id, person_id) do update
     set status = 'active', revoked_at = null, revoked_by = null, revoked_reason = null, activated_at = now()
  returning id into _grant;
  perform set_config('app.w10_control','off', true);
  perform app_private.w10_record_access_audit(_inv.tenant_id, 'participant_access.claim_accepted', _grant,
    jsonb_build_object('operation_id', _inv.operation_id, 'invitation_id', _inv.id));
  return jsonb_build_object('grant_id', _grant, 'operation_id', _inv.operation_id, 'replayed', false);
end; $function$;

create or replace function public.grant_participant_access(_operation_id uuid, _person_id uuid, _idempotency_key text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _tenant uuid; _person public.people; _part public.operation_participations;
        _id uuid; _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
        _existing jsonb; _op_status public.operation_status;
begin
  _tenant := app_private.w10_tenant_of_operation(_operation_id);
  if _tenant is null then raise exception 'Operation not found'; end if;
  perform app_private.w10_require_access_operator(_tenant);
  select o.status into _op_status from public.operations o where o.id = _operation_id and o.tenant_id = _tenant;
  if _op_status in ('completed','cancelled') then raise exception 'Portal access cannot be granted for a terminal operation'; end if;
  if _key is not null then
    select k.result into _existing from public.idempotency_keys k where k.actor_profile_id = auth.uid() and k.action = 'participant_access.grant' and k.idempotency_key = _key;
    if _existing is not null then return (_existing->>'grant_id')::uuid; end if;
  end if;
  select * into _person from public.people where id = _person_id and tenant_id = _tenant;
  if _person.id is null then raise exception 'Person not found in this organization'; end if;
  if _person.profile_id is null then raise exception 'This person has no login yet; send a participant invitation instead'; end if;
  select * into _part from public.operation_participations p where p.operation_id = _operation_id and p.person_id = _person_id and p.tenant_id = _tenant;
  if _part.id is null then raise exception 'This person is not on the roster for this operation'; end if;
  if _part.status = 'cancelled' then raise exception 'A cancelled participation cannot receive portal access'; end if;
  select g.id into _id from public.participant_access_grants g where g.operation_id = _operation_id and g.person_id = _person_id;
  perform set_config('app.w10_control','on', true);
  if _id is null then
    insert into public.participant_access_grants (tenant_id, operation_id, person_id, participation_id, profile_id, status, origin, granted_by)
    values (_tenant, _operation_id, _person_id, _part.id, _person.profile_id, 'active', 'operator_grant', auth.uid()) returning id into _id;
  else
    update public.participant_access_grants set status = 'active', revoked_at = null, revoked_by = null, revoked_reason = null, activated_at = now()
     where id = _id and status = 'revoked';
  end if;
  perform set_config('app.w10_control','off', true);
  if _key is not null then
    insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
    values (_tenant, auth.uid(), 'participant_access.grant', _key, jsonb_build_object('grant_id', _id));
  end if;
  perform app_private.w10_record_access_audit(_tenant, 'participant_access.granted', _id,
    jsonb_build_object('operation_id', _operation_id, 'person_id', _person_id));
  return _id;
end; $function$;

create or replace function public.reinstate_participant_access(_grant_id uuid, _reason text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare _g public.participant_access_grants; _r text := nullif(btrim(coalesce(_reason,'')),'');
        _link uuid; _part_status public.participation_status; _op_status public.operation_status;
begin
  if _r is null then raise exception 'A reinstatement reason is required'; end if;
  select * into _g from public.participant_access_grants where id = _grant_id;
  if _g.id is null then raise exception 'Access grant not found'; end if;
  perform app_private.w10_require_access_operator(_g.tenant_id);
  if _g.status = 'active' then return false; end if;
  select p.profile_id into _link from public.people p where p.id = _g.person_id and p.tenant_id = _g.tenant_id;
  if _link is null or _link <> _g.profile_id then raise exception 'The original login is no longer linked to this person; issue a new invitation'; end if;
  select pa.status into _part_status from public.operation_participations pa where pa.id = _g.participation_id and pa.tenant_id = _g.tenant_id;
  if _part_status = 'cancelled' then raise exception 'A cancelled participation cannot regain portal access'; end if;
  select o.status into _op_status from public.operations o where o.id = _g.operation_id and o.tenant_id = _g.tenant_id;
  if _op_status in ('completed','cancelled') then raise exception 'Portal access cannot be reinstated for a terminal operation'; end if;
  perform set_config('app.w10_control','on', true);
  update public.participant_access_grants set status = 'active', revoked_at = null, revoked_by = null, revoked_reason = null, activated_at = now() where id = _grant_id;
  perform set_config('app.w10_control','off', true);
  perform app_private.w10_record_access_audit(_g.tenant_id, 'participant_access.reinstated', _grant_id,
    jsonb_build_object('operation_id', _g.operation_id, 'reason', left(_r, 500)));
  return true;
end; $function$;