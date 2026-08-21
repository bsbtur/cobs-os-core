-- Canonical operational participant summary.
-- Keeps roster intent separate from runtime facts and exposes deterministic health reasons.

create or replace function public.get_operation_participant_summary(_operation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  _op public.operations;
  _planned int := 0;
  _confirmed int := 0;
  _present int := 0;
  _boarded int := 0;
  _no_show int := 0;
  _unconfirmed int := 0;
  _health text := 'under_control';
  _reason_code text := null;
  _reason_label text := null;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into _op from public.operations o where o.id = _operation_id;
  if _op.id is null then
    raise exception 'Operation not found';
  end if;

  if not app_private.has_tenant_role(
    _op.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then
    raise exception 'You do not have permission to view this operation summary';
  end if;

  with roster as (
    select p.id, p.status
    from public.operation_participations p
    where p.operation_id = _op.id
      and p.participation_kind = 'participant'
      and p.status <> 'cancelled'
  ), effective as (
    select e.id,
           e.participation_id,
           e.journey_step_id,
           e.presence_fact,
           e.occurred_at,
           e.recorded_at
    from public.participant_presence_events e
    where e.operation_id = _op.id
      and e.presence_fact <> 'PRESENCE_RETRACTED'
      and not exists (
        select 1
        from public.participant_presence_events r
        where r.retracts_presence_event_id = e.id
      )
  ), latest_overall as (
    select distinct on (e.participation_id)
           e.participation_id,
           e.presence_fact,
           e.occurred_at,
           e.recorded_at,
           e.id
    from effective e
    order by e.participation_id, e.occurred_at desc, e.recorded_at desc, e.id desc
  )
  select
    count(*)::int,
    count(*) filter (where r.status = 'confirmed')::int,
    count(*) filter (
      where exists (
        select 1 from effective e
        where e.participation_id = r.id
          and e.presence_fact in ('PRESENT_AT_MEETING_POINT','BOARDED','DISEMBARKED')
      )
    )::int,
    count(*) filter (
      where exists (
        select 1 from effective e
        where e.participation_id = r.id
          and e.presence_fact = 'BOARDED'
      )
    )::int,
    count(*) filter (
      where exists (
        select 1 from latest_overall l
        where l.participation_id = r.id
          and l.presence_fact = 'NO_SHOW_CONFIRMED'
      )
    )::int
  into _planned, _confirmed, _present, _boarded, _no_show
  from roster r;

  _unconfirmed := greatest(_planned - _confirmed, 0);

  -- Health only elevates for actionable runtime conditions.
  -- Draft/planning gaps are planning work, not live incidents.
  -- Completed/cancelled operations do not remain in an active warning state.
  if _op.status in ('ready','active') and _planned = 0 then
    _health := 'attention';
    _reason_code := 'NO_OPERATIONAL_PARTICIPANTS';
    _reason_label := 'Nenhum viajante operacional está vinculado à operação.';
  elsif _op.status in ('ready','active') and _unconfirmed > 0 then
    _health := 'attention';
    _reason_code := 'UNCONFIRMED_PARTICIPANTS';
    _reason_label := format('%s viajante(s) ainda precisam de confirmação.', _unconfirmed);
  elsif _op.status = 'active' and _no_show > 0 then
    _health := 'attention';
    _reason_code := 'CONFIRMED_NO_SHOWS';
    _reason_label := format('%s viajante(s) estão classificados como no-show.', _no_show);
  end if;

  return jsonb_build_object(
    'operation_id', _op.id,
    'operation_status', _op.status,
    'travelers', jsonb_build_object(
      'planned', _planned,
      'confirmed', _confirmed,
      'unconfirmed', _unconfirmed,
      'present', _present,
      'boarded', _boarded,
      'no_show', _no_show
    ),
    'health', jsonb_build_object(
      'status', _health,
      'reason_code', _reason_code,
      'reason_label', _reason_label
    )
  );
end;
$function$;

revoke all on function public.get_operation_participant_summary(uuid) from public;
grant execute on function public.get_operation_participant_summary(uuid) to authenticated;

comment on function public.get_operation_participant_summary(uuid) is
'Canonical operational participant summary. Planned means non-cancelled participant roster membership; confirmed is explicit roster confirmation; present/boarded/no-show derive only from effective append-only presence facts. Health elevates only for actionable runtime conditions and always carries a reason code.';
