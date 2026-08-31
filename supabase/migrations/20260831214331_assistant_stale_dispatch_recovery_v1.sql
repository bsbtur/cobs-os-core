create or replace function app_private.recover_stale_assistant_dispatches()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, net, vault
as $$
declare
  _recovered integer := 0;
  _dispatcher_token text;
begin
  update public.automation_events e
  set dispatch_status = 'failed',
      last_error_code = 'assistant_callback_timeout',
      last_error_message = 'Assistant dispatch exceeded callback timeout and was requeued for retry',
      updated_at = now()
  where e.event_type = 'assistant.request'
    and e.source = 'cobs_app'
    and e.dispatch_status = 'dispatched'
    and e.dispatch_attempts < 3
    and e.dispatched_at is not null
    and e.dispatched_at < now() - interval '120 seconds'
    and not exists (
      select 1 from public.automation_results r
      where r.automation_event_id = e.id
    );

  get diagnostics _recovered = row_count;
  if _recovered = 0 then return 0; end if;

  select decrypted_secret
    into _dispatcher_token
  from vault.decrypted_secrets
  where name = 'cobs_automation_dispatcher_token'
  limit 1;

  if nullif(_dispatcher_token, '') is not null then
    perform net.http_post(
      url := 'https://nktohbqmcpgonlizzcka.supabase.co/functions/v1/automation-dispatcher',
      body := jsonb_build_object('limit', least(50, greatest(10, _recovered))),
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cobs-dispatcher-token', _dispatcher_token
      ),
      timeout_milliseconds := 20000
    );
  end if;

  return _recovered;
exception
  when others then
    return _recovered;
end;
$$;

revoke all on function app_private.recover_stale_assistant_dispatches() from public;

select cron.schedule(
  'cobs-assistant-stale-dispatch-recovery',
  '* * * * *',
  'select app_private.recover_stale_assistant_dispatches();'
)
where not exists (
  select 1 from cron.job where jobname = 'cobs-assistant-stale-dispatch-recovery'
);
