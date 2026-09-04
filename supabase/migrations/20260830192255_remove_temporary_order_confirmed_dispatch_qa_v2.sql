do $$
begin
  perform cron.unschedule('cobs-order-confirmed-automation-dispatch-qa');
exception when others then null;
end $$;