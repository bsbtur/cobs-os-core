alter table public.journey_steps
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;

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

  if exists (select 1 from public.journey_events e where e.journey_step_id = _step.id)
     or exists (select 1 from public.participant_presence_events p where p.journey_step_id = _step.id) then
    raise exception 'This journey step already has operational history and cannot be archived';
  end if;

  update public.journey_steps
  set archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = _why,
      updated_at = now()
  where id = _step.id;

  perform app_private.record_audit_event(
    _step.tenant_id,
    auth.uid(),
    'journey.step_archived',
    'journey_step',
    _step.id,
    null,
    jsonb_build_object('operation_id', _step.operation_id, 'sequence', _step.sequence, 'reason', _why)
  );

  return jsonb_build_object('journey_step_id', _step.id, 'archived', true);
end;
$function$;

revoke all on function public.archive_journey_step(uuid, text) from public;
grant execute on function public.archive_journey_step(uuid, text) to authenticated;
