select cron.schedule(
  'cobs-participant-added-qa-tick',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://nktohbqmcpgonlizzcka.supabase.co/functions/v1/automation-dispatcher',
      body := '{"limit":10}'::jsonb,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'content-type','application/json',
        'x-cobs-dispatcher-token',(
          select decrypted_secret from vault.decrypted_secrets where name='cobs_automation_dispatcher_token' limit 1
        )
      ),
      timeout_milliseconds := 20000
    );
  $$
);