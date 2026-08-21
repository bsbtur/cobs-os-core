create or replace function public.get_operation_participant_action_state(
  _operation_id uuid,
  _person_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _tenant uuid;
  _op public.operations;
  _part public.operation_participations;
  _grant public.participant_access_grants;
  _inv public.participant_access_invitations;
  _terminal boolean;
  _effective boolean := false;
begin
  _tenant := app_private.w10_tenant_of_operation(_operation_id);
  if _tenant is null then raise exception 'Operation not found'; end if;
  perform app_private.w10_require_access_operator(_tenant);

  select * into _op from public.operations where id = _operation_id and tenant_id = _tenant;
  select * into _part from public.operation_participations
   where operation_id = _operation_id and person_id = _person_id and tenant_id = _tenant;
  if _part.id is null then raise exception 'This person is not on the roster for this operation'; end if;

  select * into _grant from public.participant_access_grants
   where operation_id = _operation_id and person_id = _person_id and tenant_id = _tenant
   order by created_at desc limit 1;

  select * into _inv from public.participant_access_invitations
   where operation_id = _operation_id and person_id = _person_id and tenant_id = _tenant
     and accepted_at is null and revoked_at is null and expires_at > now()
   order by created_at desc limit 1;

  _terminal := _op.status in ('completed','cancelled');
  _effective := _grant.id is not null
    and _grant.status = 'active'
    and _part.status in ('expected','confirmed')
    and _op.status <> 'cancelled';

  return jsonb_build_object(
    'operation_id', _operation_id,
    'operation_status', _op.status,
    'person_id', _person_id,
    'participation_id', _part.id,
    'participation_status', _part.status,
    'can_confirm', (not _terminal and _part.status = 'expected'),
    'can_cancel', (not _terminal and _part.status <> 'cancelled'),
    'can_reactivate', (not _terminal and _part.status = 'cancelled'),
    'participation_block_code', case when _terminal then 'OPERATION_TERMINAL' else null end,
    'participation_block_label', case when _terminal then 'A operação já foi encerrada. O roster ficou histórico e não pode mais ser alterado.' else null end,
    'portal', jsonb_build_object(
      'grant_id', _grant.id,
      'grant_status', _grant.status,
      'effective_access', _effective,
      'invitation_id', _inv.id,
      'invitation_expires_at', _inv.expires_at,
      'has_open_invitation', (_inv.id is not null),
      'can_invite', (not _terminal and _part.status <> 'cancelled' and not _effective and _inv.id is null),
      'can_copy_invitation_link', (_inv.id is not null),
      'can_revoke_invitation', (_inv.id is not null),
      'can_revoke_access', (_grant.id is not null and _grant.status = 'active'),
      'can_reinstate_access', (_grant.id is not null and _grant.status = 'revoked' and _part.status <> 'cancelled' and _op.status <> 'cancelled'),
      'block_code', case
        when _op.status = 'cancelled' then 'OPERATION_CANCELLED'
        when _op.status = 'completed' and not _effective then 'OPERATION_COMPLETED'
        when _part.status = 'cancelled' then 'PARTICIPATION_CANCELLED'
        when _effective then 'ACCESS_ACTIVE'
        when _inv.id is not null then 'INVITATION_OPEN'
        else null end,
      'block_label', case
        when _op.status = 'cancelled' then 'A operação foi cancelada e não aceita acesso ao portal.'
        when _op.status = 'completed' and not _effective then 'A operação foi concluída. Não é possível emitir um novo convite.'
        when _part.status = 'cancelled' then 'A participação está cancelada. Reative-a antes de conceder acesso.'
        when _effective then 'Acesso ao portal ativo.'
        when _inv.id is not null then 'Já existe um convite válido aguardando aceite.'
        else null end
    )
  );
end;
$function$;

grant execute on function public.get_operation_participant_action_state(uuid,uuid) to authenticated;

create or replace function public.set_participation_status(_participation_id uuid, _status participation_status, _reason text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _row public.operation_participations;
  _op_status public.operation_status;
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
  _action text;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  select * into _row from public.operation_participations p where p.id = _participation_id for update;
  if _row.id is null then raise exception 'Participation not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this roster';
  end if;
  select o.status into _op_status from public.operations o where o.id = _row.operation_id and o.tenant_id = _row.tenant_id;
  if _op_status in ('completed','cancelled') then
    raise exception 'The operation is terminal; roster changes are no longer allowed';
  end if;
  if _row.status = _status then
    return jsonb_build_object('participation_id', _row.id, 'status', _row.status, 'unchanged', true);
  end if;
  if _status = 'cancelled' and _reason_clean is null then raise exception 'A reason is required to cancel a participation'; end if;
  perform app_private.assert_generic_note(_reason_clean);
  _action := case
    when _status = 'cancelled' then 'participation.cancelled'
    when _row.status = 'cancelled' then 'participation.reactivated'
    when _status = 'confirmed' then 'participation.confirmed'
    else 'participation.status_changed'
  end;
  perform set_config('app.w03_control', 'on', true);
  update public.operation_participations set
    status = _status,
    confirmed_at = case when _status = 'confirmed' then now() else confirmed_at end,
    cancelled_at = case when _status = 'cancelled' then now() else cancelled_at end,
    cancellation_reason = case when _status = 'cancelled' then _reason_clean else cancellation_reason end,
    cancellation_count = case when _status = 'cancelled' then cancellation_count + 1 else cancellation_count end,
    reactivated_at = case when _row.status = 'cancelled' then now() else reactivated_at end
  where id = _row.id;
  perform set_config('app.w03_control', 'off', true);
  perform app_private.record_audit_event(
    _row.tenant_id, _uid, _action, 'operation_participation', _row.id, null,
    jsonb_build_object('operation_id', _row.operation_id, 'from_status', _row.status, 'to_status', _status, 'reason', _reason_clean)
  );
  return jsonb_build_object('participation_id', _row.id, 'status', _status);
end;
$function$;

create or replace function public.reinstate_participant_access(_grant_id uuid, _reason text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  _g public.participant_access_grants;
  _r text := nullif(btrim(coalesce(_reason,'')),'');
  _link uuid;
  _part_status public.participation_status;
  _op_status public.operation_status;
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
  if _op_status = 'cancelled' then raise exception 'Portal access cannot be reinstated for a cancelled operation'; end if;
  perform set_config('app.w10_control','on', true);
  update public.participant_access_grants set status = 'active', revoked_at = null, revoked_by = null, revoked_reason = null, activated_at = now() where id = _grant_id;
  perform set_config('app.w10_control','off', true);
  perform app_private.w10_record_access_audit(_g.tenant_id, 'participant_access.reinstated', _grant_id, jsonb_build_object('operation_id', _g.operation_id, 'reason', left(_r, 500)));
  return true;
end;
$function$;
