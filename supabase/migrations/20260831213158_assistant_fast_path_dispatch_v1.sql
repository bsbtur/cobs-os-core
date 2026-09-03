create or replace function app_private.assistant_kick_dispatcher()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, net, vault
as $$
declare
  _dispatcher_token text;
begin
  if new.event_type <> 'assistant.request'
     or new.source <> 'cobs_app'
     or new.dispatch_status <> 'pending' then
    return new;
  end if;

  select decrypted_secret
    into _dispatcher_token
  from vault.decrypted_secrets
  where name = 'cobs_automation_dispatcher_token'
  limit 1;

  if nullif(_dispatcher_token, '') is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://nktohbqmcpgonlizzcka.supabase.co/functions/v1/automation-dispatcher',
    body := jsonb_build_object('limit', 10),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cobs-dispatcher-token', _dispatcher_token
    ),
    timeout_milliseconds := 20000
  );

  return new;
exception
  when others then
    -- Best effort only: the durable outbox row remains pending and pg_cron retries it.
    return new;
end;
$$;

revoke all on function app_private.assistant_kick_dispatcher() from public;

DROP TRIGGER IF EXISTS trg_assistant_kick_dispatcher ON public.automation_events;
CREATE TRIGGER trg_assistant_kick_dispatcher
AFTER INSERT ON public.automation_events
FOR EACH ROW
WHEN (NEW.event_type = 'assistant.request' AND NEW.source = 'cobs_app' AND NEW.dispatch_status = 'pending')
EXECUTE FUNCTION app_private.assistant_kick_dispatcher();