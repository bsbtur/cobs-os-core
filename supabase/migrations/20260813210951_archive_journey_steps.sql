alter table public.journey_steps
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;

create index if not exists journey_steps_active_operation_sequence_idx
  on public.journey_steps (operation_id, sequence)
  where archived_at is null;

create or replace function public.archive_journey_step(
  _journey_step_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _step public.journey_steps;
  _op public.operations;
  _why text := nullif(btrim(coalesce(_reason, '')), '');
begin
  if _why is null then
    raise exception 'A reason is required to archive a journey step';
  end if;

  _step := app_private.w04_step(_journey_step_id, array['owner','admin','operations_agent']);
  select * into _op from public.operations o where o.id = _step.operation_id;

  if _op.status not in ('draft', 'planning') then
    raise exception 'Journey steps can only be archived while the operation is in draft or planning';
  end if;

  if _step.archived_at is not null then
    return jsonb_build_object('journey_step_id', _step.id, 'archived', true);
  end if;

  if _step.source_blueprint_version_id is not null or _step.source_blueprint_step_id is not null then
    raise exception 'Blueprint-provisioned journey steps cannot be archived individually';
  end if;

  if exists (select 1 from public.journey_events e where e.journey_step_id = _step.id)
     or exists (select 1 from public.participant_presence_events p where p.journey_step_id = _step.id) then
    raise exception 'This journey step already has operational history and cannot be archived';
  end if;

  if exists (select 1 from public.events e where e.journey_step_id = _step.id)
     or exists (select 1 from public.messages m where m.journey_step_id = _step.id)
     or exists (select 1 from public.transport_legs l where l.journey_step_id = _step.id) then
    raise exception 'This journey step is linked to another operational record and cannot be archived';
  end if;

  if exists (
    select 1 from public.playbook_items i
    where i.journey_step_id = _step.id and i.is_active = true
  ) then
    raise exception 'Deactivate checklist items from this journey step before archiving it';
  end if;

  perform set_config('app.w04_control','on', true);
  update public.journey_steps
  set archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = _why,
      updated_at = now()
  where id = _step.id;
  perform set_config('app.w04_control','off', true);

  perform app_private.record_audit_event(
    _step.tenant_id,
    auth.uid(),
    'journey.step_archived',
    'journey_step',
    _step.id,
    null,
    jsonb_build_object(
      'operation_id', _step.operation_id,
      'operation_status', _op.status,
      'sequence', _step.sequence,
      'title', _step.title,
      'reason', _why
    )
  );

  return jsonb_build_object('journey_step_id', _step.id, 'archived', true);
end;
$function$;

revoke all on function public.archive_journey_step(uuid, text) from public;
grant execute on function public.archive_journey_step(uuid, text) to authenticated;

create or replace function public.reorder_journey_steps(
  _operation_id uuid,
  _step_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _op public.operations;
  _id uuid;
  _i int := 0;
  _count int;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);
  if _op.status not in ('draft','planning') then
    raise exception 'The journey baseline is frozen from "ready" onward and cannot be reordered';
  end if;

  select count(*) into _count
  from public.journey_steps s
  where s.operation_id = _op.id
    and s.archived_at is null;

  if _count <> coalesce(array_length(_step_ids,1),0) then
    raise exception 'The reorder request must contain every active step of this operation exactly once';
  end if;

  if exists (
    select 1
    from unnest(_step_ids) as requested(id)
    left join public.journey_steps s
      on s.id = requested.id
     and s.operation_id = _op.id
     and s.archived_at is null
    where s.id is null
  ) then
    raise exception 'The reorder request contains an invalid or archived journey step';
  end if;

  perform set_config('app.w04_control','on', true);
  update public.journey_steps
  set sequence = -sequence
  where operation_id = _op.id
    and archived_at is null;

  foreach _id in array _step_ids loop
    _i := _i + 10;
    update public.journey_steps
    set sequence = _i
    where id = _id
      and operation_id = _op.id
      and archived_at is null;
  end loop;
  perform set_config('app.w04_control','off', true);

  if exists (
    select 1 from public.journey_steps s
    where s.operation_id = _op.id
      and s.archived_at is null
      and s.sequence < 0
  ) then
    raise exception 'The reorder request must contain every active step of this operation exactly once';
  end if;

  perform app_private.record_audit_event(
    _op.tenant_id,
    auth.uid(),
    'journey.steps_reordered',
    'operation',
    _op.id,
    null,
    jsonb_build_object('steps', array_length(_step_ids,1))
  );

  return jsonb_build_object('operation_id', _op.id, 'steps', array_length(_step_ids,1));
end;
$function$;