do $$
begin
  if exists (select 1 from cron.job where jobname='cobs-order-confirmed-automation-dispatch-qa') then
    perform cron.unschedule('cobs-order-confirmed-automation-dispatch-qa');
  end if;
end $$;