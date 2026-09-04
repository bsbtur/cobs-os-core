-- W02 hardening: creation boundary + internal trigger function privileges.

create or replace function public.guard_operation_insert()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if app_private.op_control_active() then
    return new;
  end if;
  -- A new operation always starts as an un-executed draft. Lifecycle and
  -- temporal facts are only produced by the canonical commands.
  new.status := 'draft';
  new.completed_at := null;
  new.cancelled_at := null;
  new.cancellation_reason := null;
  new.archived_at := null;
  new.expected_start := null;
  new.expected_end := null;
  return new;
end;
$$;

create trigger operations_guard_insert before insert on public.operations
  for each row execute function public.guard_operation_insert();

revoke all on function public.guard_operation_insert() from public, anon, authenticated;
revoke all on function public.guard_operation_mutation() from public, anon, authenticated;
revoke all on function public.audit_catalog_change() from public, anon, authenticated;