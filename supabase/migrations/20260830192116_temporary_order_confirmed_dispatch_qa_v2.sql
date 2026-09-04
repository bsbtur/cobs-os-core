do $$
begin
  perform cron.unschedule('cobs-order-confirmed-automation-dispatch-qa');
exception when others then null;
end $$;

select cron.schedule(
  'cobs-order-confirmed-automation-dispatch-qa',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://nktohbqmcpgonlizzcka.supabase.co/functions/v1/automation-dispatcher',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cobs-dispatcher-token',(select decrypted_secret from vault.decrypted_secrets where name='cobs_automation_dispatcher_token')
      ),
      body := '{"limit":10}'::jsonb
    );
  $cron$
);