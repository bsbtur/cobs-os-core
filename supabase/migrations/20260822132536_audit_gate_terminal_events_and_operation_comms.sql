create or replace function app_private.guard_event_parent_operation_open()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare _status public.operation_status;
begin
  select o.status into _status from public.operations o where o.id = new.operation_id and o.tenant_id = new.tenant_id;
  if _status is null then raise exception 'Event operation not found in this organization'; end if;
  if _status in ('completed','cancelled') then
    raise exception 'Events cannot be created or re-parented on a terminal operation';
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_event_parent_operation_open() from public, anon, authenticated;

drop trigger if exists trg_guard_event_parent_operation_open on public.events;
create trigger trg_guard_event_parent_operation_open
before insert or update of operation_id, tenant_id on public.events
for each row execute function app_private.guard_event_parent_operation_open();

create or replace function app_private.guard_message_parent_operation_open()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare _status public.operation_status;
begin
  if new.operation_id is null then return new; end if;
  select o.status into _status from public.operations o where o.id = new.operation_id and o.tenant_id = new.tenant_id;
  if _status is null then raise exception 'Message operation not found in this organization'; end if;
  if _status in ('completed','cancelled') and new.status <> 'cancelled' then
    raise exception 'Operation-scoped messages are read-only after the operation becomes terminal';
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_message_parent_operation_open() from public, anon, authenticated;

drop trigger if exists trg_guard_message_parent_operation_open on public.messages;
create trigger trg_guard_message_parent_operation_open
before insert or update on public.messages
for each row execute function app_private.guard_message_parent_operation_open();

create or replace function app_private.guard_operation_terminal_event_comms()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare _open_events integer; _scheduled_messages integer;
begin
  if new.status in ('completed','cancelled') and old.status not in ('completed','cancelled') then
    select count(*) into _open_events from public.events e
      where e.operation_id = new.id and e.tenant_id = new.tenant_id and e.status <> 'closed_out';
    if _open_events > 0 then
      raise exception 'This operation cannot become terminal because % event(s) are still open. Complete or cancel them first.', _open_events;
    end if;

    select count(*) into _scheduled_messages from public.messages m
      where m.operation_id = new.id and m.tenant_id = new.tenant_id and m.status = 'scheduled';
    if _scheduled_messages > 0 then
      raise exception 'This operation cannot become terminal because % scheduled message(s) are still pending. Publish or cancel them first.', _scheduled_messages;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_operation_terminal_event_comms() from public, anon, authenticated;

drop trigger if exists trg_guard_operation_terminal_event_comms on public.operations;
create trigger trg_guard_operation_terminal_event_comms
before update of status on public.operations
for each row execute function app_private.guard_operation_terminal_event_comms();