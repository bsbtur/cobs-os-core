-- COBS OS V1 Release Gate — close the remaining W03 roster mutation gaps.
-- Completed/cancelled operations are historical records and operationally read-only.
-- Reuses the canonical app_private.assert_operation_not_closed helper.

create or replace function public.add_operation_participation(
  _operation_id uuid,
  _person_id uuid,
  _participation_kind participation_kind,
  _idempotency_key text,
  _role_type_ids uuid[] default '{}'::uuid[],
  _primary_role_type_id uuid default null::uuid,
  _notes text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _key text := nullif(btrim(coalesce(_idempotency_key, '')), '');
  _existing jsonb;
  _op public.operations;
  _person public.people;
  _row public.operation_participations;
  _role uuid;
  _note text := nullif(btrim(coalesce(_notes, '')), '');
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if _key is null then raise exception 'Idempotency key is required'; end if;

  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then raise exception 'Operation not found'; end if;
  if not app_private.has_tenant_role(_op.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this roster';
  end if;
  perform app_private.assert_operation_not_closed(_operation_id);

  select k.result into _existing from public.idempotency_keys k
    where k.actor_profile_id = _uid and k.action = 'participation.add' and k.idempotency_key = _key;
  if _existing is not null then return _existing; end if;

  select * into _person from public.people p
    where p.id = _person_id and p.tenant_id = _op.tenant_id;
  if _person.id is null then raise exception 'Person not found in this organization'; end if;

  perform app_private.assert_generic_note(_note);
  perform app_private.provision_role_types(_op.tenant_id);

  perform set_config('app.w03_control', 'on', true);

  insert into public.operation_participations
    (tenant_id, operation_id, person_id, participation_kind, notes, created_by)
  values (_op.tenant_id, _operation_id, _person_id, _participation_kind, _note, _uid)
  on conflict (operation_id, person_id) do nothing
  returning * into _row;

  if _row.id is null then
    perform set_config('app.w03_control', 'off', true);
    raise exception 'This person is already on this operation roster';
  end if;

  foreach _role in array coalesce(_role_type_ids, '{}') loop
    insert into public.operation_role_assignments
      (tenant_id, participation_id, role_type_id, is_primary, created_by)
    select _op.tenant_id, _row.id, rt.id,
           (_primary_role_type_id is not null and rt.id = _primary_role_type_id), _uid
      from public.operation_role_types rt
      where rt.id = _role and rt.tenant_id = _op.tenant_id
    on conflict (participation_id, role_type_id) do nothing;
  end loop;

  perform set_config('app.w03_control', 'off', true);

  perform app_private.record_audit_event(
    _op.tenant_id, _uid, 'participation.added', 'operation_participation', _row.id, _key,
    jsonb_build_object('operation_id', _operation_id, 'participation_kind', _participation_kind,
                       'status', _row.status, 'roles', coalesce(array_length(_role_type_ids, 1), 0))
  );

  _existing := jsonb_build_object('participation_id', _row.id, 'tenant_id', _op.tenant_id,
                                  'operation_id', _operation_id, 'person_id', _person_id);
  insert into public.idempotency_keys (tenant_id, actor_profile_id, action, idempotency_key, result)
  values (_op.tenant_id, _uid, 'participation.add', _key, _existing);
  return _existing;
end;
$function$;

create or replace function public.assign_operation_role(
  _participation_id uuid,
  _role_type_id uuid,
  _is_primary boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _row public.operation_participations;
  _type public.operation_role_types;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _row from public.operation_participations p where p.id = _participation_id;
  if _row.id is null then raise exception 'Participation not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this roster';
  end if;
  perform app_private.assert_operation_not_closed(_row.operation_id);

  select * into _type from public.operation_role_types rt
    where rt.id = _role_type_id and rt.tenant_id = _row.tenant_id and rt.is_active;
  if _type.id is null then raise exception 'Role not available in this organization'; end if;

  perform set_config('app.w03_control', 'on', true);
  if _is_primary then
    update public.operation_role_assignments set is_primary = false
      where participation_id = _row.id and is_primary;
  end if;
  insert into public.operation_role_assignments
    (tenant_id, participation_id, role_type_id, is_primary, created_by)
  values (_row.tenant_id, _row.id, _role_type_id, coalesce(_is_primary, false), _uid)
  on conflict (participation_id, role_type_id)
    do update set is_primary = excluded.is_primary;
  perform set_config('app.w03_control', 'off', true);

  perform app_private.record_audit_event(
    _row.tenant_id, _uid, 'participation.role_assigned', 'operation_participation', _row.id, null,
    jsonb_build_object('role_key', _type.key, 'is_primary', coalesce(_is_primary, false))
  );

  return jsonb_build_object('participation_id', _row.id, 'role_type_id', _role_type_id);
end;
$function$;

create or replace function public.set_primary_operation_role(
  _participation_id uuid,
  _role_type_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _row public.operation_participations;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _row from public.operation_participations p where p.id = _participation_id;
  if _row.id is null then raise exception 'Participation not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this roster';
  end if;
  perform app_private.assert_operation_not_closed(_row.operation_id);

  if _role_type_id is not null and not exists (
    select 1 from public.operation_role_assignments a
      where a.participation_id = _row.id and a.role_type_id = _role_type_id
  ) then
    raise exception 'That role is not assigned to this person';
  end if;

  perform set_config('app.w03_control', 'on', true);
  update public.operation_role_assignments set is_primary = false
    where participation_id = _row.id and is_primary;
  if _role_type_id is not null then
    update public.operation_role_assignments set is_primary = true
      where participation_id = _row.id and role_type_id = _role_type_id;
  end if;
  perform set_config('app.w03_control', 'off', true);

  perform app_private.record_audit_event(
    _row.tenant_id, _uid, 'participation.primary_role_changed', 'operation_participation', _row.id, null,
    jsonb_build_object('role_type_id', _role_type_id)
  );

  return jsonb_build_object('participation_id', _row.id, 'primary_role_type_id', _role_type_id);
end;
$function$;

create or replace function public.unassign_operation_role(
  _participation_id uuid,
  _role_type_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _row public.operation_participations;
  _type public.operation_role_types;
begin
  if _uid is null then raise exception 'Authentication required'; end if;

  select * into _row from public.operation_participations p where p.id = _participation_id;
  if _row.id is null then raise exception 'Participation not found'; end if;
  if not app_private.has_tenant_role(_row.tenant_id, array['owner','admin','operations_agent']::public.app_role[]) then
    raise exception 'You do not have permission to change this roster';
  end if;
  perform app_private.assert_operation_not_closed(_row.operation_id);

  select * into _type from public.operation_role_types rt where rt.id = _role_type_id;

  perform set_config('app.w03_control', 'on', true);
  delete from public.operation_role_assignments
    where participation_id = _row.id and role_type_id = _role_type_id;
  perform set_config('app.w03_control', 'off', true);

  perform app_private.record_audit_event(
    _row.tenant_id, _uid, 'participation.role_unassigned', 'operation_participation', _row.id, null,
    jsonb_build_object('role_key', _type.key)
  );

  return jsonb_build_object('participation_id', _row.id, 'role_type_id', _role_type_id);
end;
$function$;
