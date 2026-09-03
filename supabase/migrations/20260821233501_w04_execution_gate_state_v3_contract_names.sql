create or replace function public.w04_operation_runtime_state(_operation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _op public.operations;
  _current uuid;
  _next uuid;
  _can_start_next boolean := false;
  _block_code text := null;
  _block_label text := null;
begin
  _op := app_private.w04_operation(_operation_id, array['owner','admin','operations_agent']);

  select s.id into _current
  from public.journey_steps s
  join public.journey_events e
    on e.journey_step_id = s.id
   and e.event_type = 'STEP_STARTED'
  where s.operation_id = _op.id
    and s.archived_at is null
    and not exists (
      select 1 from public.journey_events c
      where c.journey_step_id = s.id
        and c.event_type in ('STEP_COMPLETED','STEP_SKIPPED')
    )
  order by e.occurred_at desc, e.recorded_at desc
  limit 1;

  select s.id into _next
  from public.journey_steps s
  where s.operation_id = _op.id
    and s.archived_at is null
    and s.id is distinct from _current
    and not exists (
      select 1 from public.journey_events c
      where c.journey_step_id = s.id
        and c.event_type in ('STEP_STARTED','STEP_COMPLETED','STEP_SKIPPED')
    )
  order by s.sequence
  limit 1;

  _can_start_next := _current is null and _next is not null and _op.status in ('ready','active');

  if _op.status in ('completed','cancelled') then
    _block_code := 'OPERATION_TERMINAL';
    _block_label := 'A operação já foi encerrada e não aceita novas ações operacionais.';
  elsif _current is not null then
    _block_code := 'STEP_ALREADY_ACTIVE';
    _block_label := 'Conclua ou pule a etapa ativa antes de iniciar a próxima.';
  elsif _op.status in ('draft','planning') then
    _block_code := 'OPERATION_NOT_READY';
    _block_label := 'A operação ainda não está pronta para execução. Avance o ciclo até Pronta.';
  elsif _next is null then
    _block_code := 'NO_NEXT_STEP';
    _block_label := 'Não há próxima etapa disponível para iniciar.';
  end if;

  return jsonb_build_object(
    'operation_id', _op.id,
    'status', _op.status,
    'current_step_id', _current,
    'next_step_id', _next,
    'can_start_next', _can_start_next,
    'start_next_block_code', _block_code,
    'start_next_block_label', _block_label,
    -- Temporary aliases retained for any preview surface already consuming v2.
    'execution_block_code', _block_code,
    'execution_block_label', _block_label,
    'readiness', case when _current is null then null else public.w04_step_readiness(_current) end
  );
end;
$function$;