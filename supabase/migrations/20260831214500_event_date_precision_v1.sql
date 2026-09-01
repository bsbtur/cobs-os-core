-- COBS OS · Event Date Precision V1
-- Preserve technical timestamps while distinguishing confirmed date-only planning
-- from confirmed date+time planning. Existing events remain datetime by default.

alter table public.events
  add column if not exists schedule_precision text not null default 'datetime';

alter table public.events
  drop constraint if exists events_schedule_precision_check;

alter table public.events
  add constraint events_schedule_precision_check
  check (schedule_precision in ('datetime', 'date_only'));

create or replace function public.set_event_schedule_precision(
  _event_id uuid,
  _schedule_precision text,
  _idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _row public.events;
  _key text := nullif(btrim(coalesce(_idempotency_key,'')),'');
  _precision text := lower(nullif(btrim(coalesce(_schedule_precision,'')),''));
  _out jsonb;
begin
  select * into _row from public.events e where e.id = _event_id;
  if _row.id is null then raise exception 'Event not found'; end if;

  if not app_private.has_tenant_role(
    _row.tenant_id,
    array['owner','admin','operations_agent']::public.app_role[]
  ) then
    raise exception 'You do not have permission for event production in this organization';
  end if;

  if _key is null then raise exception 'Idempotency key is required'; end if;
  if _precision not in ('datetime','date_only') then
    raise exception 'Invalid schedule precision';
  end if;

  _out := app_private.w06_replay('event.schedule_precision', _key);
  if _out is not null then return _out; end if;

  perform set_config('app.w07_control','on', true);
  update public.events
     set schedule_precision = _precision,
         updated_at = now()
   where id = _row.id
   returning * into _row;
  perform set_config('app.w07_control','off', true);

  perform app_private.record_audit_event(
    _row.tenant_id,
    auth.uid(),
    'event.schedule_precision.updated',
    'event',
    _row.id,
    _key,
    jsonb_build_object('schedule_precision', _precision)
  );

  _out := jsonb_build_object(
    'event_id', _row.id,
    'operation_id', _row.operation_id,
    'tenant_id', _row.tenant_id,
    'schedule_precision', _row.schedule_precision
  );
  perform app_private.w06_claim_key(_row.tenant_id, 'event.schedule_precision', _key, _out);
  return _out;
end;
$function$;

revoke all on function public.set_event_schedule_precision(uuid,text,text) from public;
grant execute on function public.set_event_schedule_precision(uuid,text,text) to authenticated;

create or replace function public.get_my_event_program(_operation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare _ctx jsonb; _events jsonb;
begin
  _ctx := app_private.w10_assert_effective_access(_operation_id);
  select coalesce(jsonb_agg(x order by x->>'planned_start'), '[]'::jsonb) into _events
  from (
    select jsonb_build_object(
      'event_id', ev.id,
      'name', ev.name,
      'source_kind', ev.source_kind,
      'external_producer_name', ev.external_producer_name,
      'timezone', ev.timezone,
      'schedule_precision', ev.schedule_precision,
      'planned_start', ev.planned_start,
      'planned_end', ev.planned_end,
      'expected_start', ev.expected_start,
      'expected_end', ev.expected_end,
      'closed_out', (ev.closed_out_at is not null),
      'venue', case when v.id is null then null else jsonb_build_object(
          'name', v.name,
          'country_code', v.country_code,
          'region', v.region,
          'city', v.city,
          'address_label', v.address_label,
          'timezone', v.timezone) end,
      'sessions', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'session_id', ss.id,
                 'sequence', ss.sequence,
                 'title', ss.title,
                 'description', ss.description,
                 'session_kind', ss.session_kind,
                 'planned_start', ss.planned_start,
                 'planned_end', ss.planned_end,
                 'expected_start', ss.expected_start,
                 'expected_end', ss.expected_end,
                 'space', case when sp.id is null then null else jsonb_build_object(
                      'name', sp.name, 'space_label', sp.space_label,
                      'floor_label', sp.floor_label) end
               ) order by ss.sequence), '[]'::jsonb)
        from public.event_sessions ss
        left join public.venue_spaces sp on sp.id = ss.venue_space_id
        where ss.event_id = ev.id
          and ss.session_kind not in ('setup','teardown','rehearsal'))
    ) as x
    from public.events ev
    left join public.venues v on v.id = ev.venue_id
    where ev.operation_id = _operation_id
      and ev.status <> 'draft'
  ) t;
  return jsonb_build_object('operation_id', _operation_id, 'events', _events);
end;
$function$;

comment on column public.events.schedule_precision is
  'datetime = date and time are confirmed; date_only = only the event dates are confirmed and UI must not present technical timestamps as official times.';
