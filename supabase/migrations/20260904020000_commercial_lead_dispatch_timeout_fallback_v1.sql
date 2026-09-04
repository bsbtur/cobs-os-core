create or replace function app_private.recover_stale_commercial_lead_dispatches()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  _recovered integer := 0;
begin
  with stale as (
    select e.id, e.tenant_id
    from public.automation_events e
    where e.event_type = 'lead.created'
      and e.source = 'ciosp_public'
      and e.dispatch_status = 'dispatched'
      and e.dispatched_at is not null
      and e.dispatched_at < now() - interval '120 seconds'
      and not exists (
        select 1
        from public.automation_results r
        where r.automation_event_id = e.id
      )
    for update skip locked
  ), inserted as (
    insert into public.automation_results (
      tenant_id,
      automation_event_id,
      outcome,
      intent,
      urgency,
      summary,
      suggested_reply,
      error_code,
      error_message,
      provider_metadata
    )
    select
      s.tenant_id,
      s.id,
      'failed',
      null,
      null,
      null,
      null,
      'commercial_callback_timeout',
      'Commercial automation callback was not received within 120 seconds; manual follow-up is required',
      jsonb_build_object(
        'fallback', 'manual_followup',
        'orchestrator', 'n8n',
        'reason', 'callback_timeout',
        'timeout_seconds', 120
      )
    from stale s
    on conflict (automation_event_id) do nothing
    returning automation_event_id
  )
  update public.automation_events e
  set dispatch_status = 'failed',
      completed_at = null,
      last_error_code = 'commercial_callback_timeout',
      last_error_message = 'Commercial automation callback was not received within 120 seconds; manual follow-up is required',
      updated_at = now()
  where e.id in (select automation_event_id from inserted);

  get diagnostics _recovered = row_count;
  return _recovered;
end;
$$;

revoke all on function app_private.recover_stale_commercial_lead_dispatches() from public;

select cron.schedule(
  'cobs-commercial-lead-stale-dispatch-recovery',
  '* * * * *',
  'select app_private.recover_stale_commercial_lead_dispatches();'
)
where not exists (
  select 1
  from cron.job
  where jobname = 'cobs-commercial-lead-stale-dispatch-recovery'
);

select app_private.recover_stale_commercial_lead_dispatches();
