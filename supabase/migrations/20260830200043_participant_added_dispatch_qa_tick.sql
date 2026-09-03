select cron.schedule(
  'cobs-participant-added-automation-dispatch-qa',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://nktohbqmcpgonlizzcka.supabase.co/functions/v1/automation-dispatcher',
      headers := jsonb_build_object(
        'content-type','application/json',
        'x-cobs-dispatcher-token',(select decrypted_secret from vault.decrypted_secrets where name='cobs_automation_dispatcher_token' limit 1)
      ),
      body := jsonb_build_object('limit',10)
    );
  $$
);