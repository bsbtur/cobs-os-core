create or replace function app_private.assert_operation_not_closed(_operation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _status public.operation_status;
begin
  if _operation_id is null then
    return;
  end if;

  select o.status into _status
  from public.operations o
  where o.id = _operation_id;

  if _status is null then
    raise exception 'Operation not found';
  end if;

  if _status in ('completed','cancelled') then
    raise exception 'A % operation is historical and read-only', _status;
  end if;
end;
$$;

create or replace function app_private.guard_closed_operation_child()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _operation_id uuid;
begin
  if tg_op = 'DELETE' then
    _operation_id := nullif(to_jsonb(old)->>'operation_id','')::uuid;
  else
    _operation_id := nullif(to_jsonb(new)->>'operation_id','')::uuid;
  end if;

  perform app_private.assert_operation_not_closed(_operation_id);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function app_private.guard_closed_operation_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _participation_id uuid;
  _operation_id uuid;
begin
  if tg_op = 'DELETE' then
    _participation_id := old.participation_id;
  else
    _participation_id := new.participation_id;
  end if;

  select p.operation_id into _operation_id
  from public.operation_participations p
  where p.id = _participation_id;

  perform app_private.assert_operation_not_closed(_operation_id);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_closed_op_participations on public.operation_participations;
create trigger trg_closed_op_participations
before insert or update or delete on public.operation_participations
for each row execute function app_private.guard_closed_operation_child();

drop trigger if exists trg_closed_op_staff_assignments on public.operation_staff_assignments;
create trigger trg_closed_op_staff_assignments
before insert or update or delete on public.operation_staff_assignments
for each row execute function app_private.guard_closed_operation_child();

drop trigger if exists trg_closed_op_transport_legs on public.transport_legs;
create trigger trg_closed_op_transport_legs
before insert or update or delete on public.transport_legs
for each row execute function app_private.guard_closed_operation_child();

drop trigger if exists trg_closed_op_hospitality_stays on public.hospitality_stays;
create trigger trg_closed_op_hospitality_stays
before insert or update or delete on public.hospitality_stays
for each row execute function app_private.guard_closed_operation_child();

drop trigger if exists trg_closed_op_events on public.events;
create trigger trg_closed_op_events
before insert or update or delete on public.events
for each row execute function app_private.guard_closed_operation_child();

drop trigger if exists trg_closed_op_messages on public.messages;
create trigger trg_closed_op_messages
before insert or update or delete on public.messages
for each row execute function app_private.guard_closed_operation_child();

drop trigger if exists trg_closed_op_role_assignments on public.operation_role_assignments;
create trigger trg_closed_op_role_assignments
before insert or update or delete on public.operation_role_assignments
for each row execute function app_private.guard_closed_operation_role_assignment();