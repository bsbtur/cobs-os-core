create extension if not exists pg_cron;

create table if not exists app_private.staff_alert_scheduler_state (
  singleton boolean primary key default true check (singleton),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error jsonb,
  paused_at timestamptz
);

alter table app_private.staff_alert_scheduler_state enable row level security;
revoke all on table app_private.staff_alert_scheduler_state
  from public, anon, authenticated, service_role;

insert into app_private.staff_alert_scheduler_state (singleton)
values (true)
on conflict (singleton) do nothing;

drop policy if exists staff_alert_scheduler_state_deny_all
  on app_private.staff_alert_scheduler_state;
create policy staff_alert_scheduler_state_deny_all
  on app_private.staff_alert_scheduler_state
  as restrictive
  for all
  to public
  using (false)
  with check (false);

create or replace function app_private.run_due_staff_journey_alerts(
  _window_start timestamptz default (now() - interval '6 minutes'),
  _window_end timestamptz default (now() + interval '1 minute')
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _tenant record;
  _result jsonb;
  _results jsonb := '[]'::jsonb;
  _errors jsonb := '[]'::jsonb;
  _created integer := 0;
  _failure_count integer := 0;
  _job_id bigint;
begin
  if session_user <> 'postgres' then
    raise exception 'Internal scheduler only';
  end if;

  if _window_start is null or _window_end is null or _window_end <= _window_start then
    raise exception 'Invalid alert generation window';
  end if;

  if _window_end - _window_start > interval '2 hours' then
    raise exception 'Alert generation window cannot exceed 2 hours';
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended('cobs:staff-journey-alerts', 0)) then
    return jsonb_build_object('status', 'skipped_concurrent_run');
  end if;

  if exists (
    select 1
    from app_private.staff_alert_scheduler_state
    where singleton and paused_at is not null
  ) then
    return jsonb_build_object('status', 'paused');
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);

  for _tenant in
    with milestones as (
      select a.tenant_id, a.report_at - interval '15 minutes' as alert_at
      from public.operation_staff_assignments a
      join public.operations op on op.id = a.operation_id
      where op.status not in ('completed', 'cancelled')
        and a.status in ('assigned', 'confirmed')
        and a.report_at is not null

      union all

      select a.tenant_id, a.starts_at - interval '15 minutes'
      from public.operation_staff_assignments a
      join public.operations op on op.id = a.operation_id
      where op.status not in ('completed', 'cancelled')
        and a.status in ('assigned', 'confirmed')
        and a.starts_at is not null

      union all

      select a.tenant_id, a.ends_at - interval '15 minutes'
      from public.operation_staff_assignments a
      join public.operations op on op.id = a.operation_id
      where op.status not in ('completed', 'cancelled')
        and a.status in ('assigned', 'confirmed')
        and a.ends_at is not null
    )
    select distinct tenant_id
    from milestones
    where alert_at >= _window_start
      and alert_at < _window_end
  loop
    begin
      _result := public.generate_due_staff_journey_alerts(
        _tenant.tenant_id,
        _window_start,
        _window_end
      );
      _created := _created + coalesce((_result ->> 'created')::integer, 0);
      _results := _results || jsonb_build_array(_result);
    exception when others then
      _errors := _errors || jsonb_build_array(
        jsonb_build_object(
          'tenant_id', _tenant.tenant_id,
          'sqlstate', sqlstate,
          'error', sqlerrm
        )
      );
    end;
  end loop;

  if jsonb_array_length(_errors) = 0 then
    update app_private.staff_alert_scheduler_state
    set consecutive_failures = 0,
        last_run_at = now(),
        last_success_at = now(),
        last_error = null
    where singleton;
  else
    update app_private.staff_alert_scheduler_state
    set consecutive_failures = consecutive_failures + 1,
        last_run_at = now(),
        last_error = _errors
    where singleton
    returning consecutive_failures into _failure_count;

    if _failure_count >= 3 then
      update app_private.staff_alert_scheduler_state
      set paused_at = now()
      where singleton;

      select jobid
      into _job_id
      from cron.job
      where jobname = 'cobs-staff-journey-alerts-v1';

      if _job_id is not null then
        perform cron.alter_job(_job_id, null, null, null, null, false);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', case
      when jsonb_array_length(_errors) = 0 then 'ok'
      when _failure_count >= 3 then 'paused_after_three_failures'
      else 'completed_with_errors'
    end,
    'window_start', _window_start,
    'window_end', _window_end,
    'tenants', _results,
    'errors', _errors,
    'created', _created,
    'consecutive_failures', _failure_count
  );
end;
$function$;

revoke all on function app_private.run_due_staff_journey_alerts(timestamptz, timestamptz)
  from public, anon, authenticated, service_role;

do $block$
declare
  _job_id bigint;
begin
  select jobid
  into _job_id
  from cron.job
  where jobname = 'cobs-staff-journey-alerts-v1';

  if _job_id is not null then
    perform cron.unschedule(_job_id);
  end if;
end;
$block$;

select cron.schedule(
  'cobs-staff-journey-alerts-v1',
  '*/5 * * * *',
  $cron$select app_private.run_due_staff_journey_alerts();$cron$
);
