-- =====================================================================
-- COBS OS · PX12.6-B — JOURNEY MUTATION HARDENING
-- Additive / defensive only. Preserve W04 Planned != Expected != Actual.
-- =====================================================================

alter table public.journey_steps
  add constraint journey_steps_planned_window_order
  check (planned_start is null or planned_end is null or planned_end >= planned_start)
  not valid;

alter table public.journey_steps
  add constraint journey_steps_expected_window_order
  check (expected_start is null or expected_end is null or expected_end >= expected_start)
  not valid;

alter table public.journey_steps
  add constraint journey_steps_title_nonblank
  check (nullif(btrim(title), '') is not null)
  not valid;

alter table public.playbook_items
  add constraint playbook_items_title_nonblank
  check (nullif(btrim(title), '') is not null)
  not valid;

create or replace function public.guard_journey_step_baseline()
returns trigger
language plpgsql
set search_path = 'pg_catalog','public'
as $$
declare
  _status public.operation_status;
begin
  if new.plan_origin is distinct from old.plan_origin then
    raise exception 'A journey step cannot change between planned and ad-hoc';
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.operation_id is distinct from old.operation_id then
    raise exception 'A journey step cannot be moved between operations';
  end if;

  select o.status into _status
  from public.operations o
  where o.id = new.operation_id;

  if _status not in ('draft','planning') then
    if new.sequence is distinct from old.sequence
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.step_kind is distinct from old.step_kind
       or new.ad_hoc_reason is distinct from old.ad_hoc_reason
       or new.planned_start is distinct from old.planned_start
       or new.planned_end is distinct from old.planned_end
       or new.location_label is distinct from old.location_label
       or new.traveler_label is distinct from old.traveler_label
       or new.traveler_facing is distinct from old.traveler_facing
       or new.presence_requirement is distinct from old.presence_requirement
       or new.presence_population is distinct from old.presence_population
       or new.metadata is distinct from old.metadata
       or new.source_blueprint_version_id is distinct from old.source_blueprint_version_id
       or new.source_blueprint_step_id is distinct from old.source_blueprint_step_id
       or new.archived_at is distinct from old.archived_at
       or new.archived_by is distinct from old.archived_by
       or new.archive_reason is distinct from old.archive_reason then
      raise exception 'The journey planning baseline is frozen from "ready" onward. Only the expected window may change.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_playbook_item_baseline()
returns trigger
language plpgsql
set search_path = 'pg_catalog','public'
as $$
declare
  _operation_id uuid;
  _status public.operation_status;
begin
  _operation_id := case when tg_op = 'DELETE' then old.operation_id else new.operation_id end;

  select o.status into _status
  from public.operations o
  where o.id = _operation_id;

  if _status is null then
    raise exception 'Operation not found for checklist item';
  end if;

  if _status not in ('draft','planning') then
    raise exception 'Checklist definitions are frozen from "ready" onward. Record runtime execution facts instead of rewriting the checklist.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists playbook_items_baseline on public.playbook_items;
create trigger playbook_items_baseline
before insert or update or delete on public.playbook_items
for each row execute function public.guard_playbook_item_baseline();

revoke all on function public.guard_playbook_item_baseline() from public;
revoke all on function public.guard_playbook_item_baseline() from anon;
revoke all on function public.guard_playbook_item_baseline() from authenticated;

revoke all on function public.guard_journey_step_baseline() from public;
revoke all on function public.guard_journey_step_baseline() from anon;
revoke all on function public.guard_journey_step_baseline() from authenticated;