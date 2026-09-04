do $$
begin
  if exists (select 1 from cron.job where jobname='cobs-payments-reconcile-pending') then
    perform cron.unschedule('cobs-payments-reconcile-pending');
  end if;
end $$;

select cron.schedule(
  'cobs-payments-reconcile-pending',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://nktohbqmcpgonlizzcka.supabase.co/functions/v1/payments-reconcile-pending',
      body := '{"limit":25}'::jsonb,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'content-type','application/json',
        'x-cobs-reconcile-token',(
          select decrypted_secret
          from vault.decrypted_secrets
          where name='cobs_payment_reconcile_token'
          limit 1
        )
      ),
      timeout_milliseconds := 20000
    );
  $cron$
);