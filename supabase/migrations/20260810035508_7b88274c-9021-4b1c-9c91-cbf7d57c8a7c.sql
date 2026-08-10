-- W03 command surface: least privilege, matching the W01/W02 convention.
do $$
declare
  _sig text;
begin
  foreach _sig in array array[
    'public.ensure_operation_role_types(uuid)',
    'public.add_operation_participation(uuid, uuid, public.participation_kind, text, uuid[], uuid, text)',
    'public.set_participation_status(uuid, public.participation_status, text)',
    'public.assign_operation_role(uuid, uuid, boolean)',
    'public.unassign_operation_role(uuid, uuid)',
    'public.set_primary_operation_role(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', _sig);
    execute format('grant execute on function %s to authenticated, service_role', _sig);
  end loop;
end;
$$;
