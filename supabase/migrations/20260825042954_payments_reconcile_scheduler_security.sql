create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cobs_payment_reconcile_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      'cobs_payment_reconcile_token',
      'Internal token used only by pg_cron/pg_net to invoke the COBS Mercado Pago pending-payment reconciler',
      null
    );
  end if;
end $$;

create or replace function public.verify_payment_reconcile_token(_candidate text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, vault
as $$
  select coalesce(
    _candidate is not null
    and length(_candidate) >= 32
    and _candidate = (
      select ds.decrypted_secret
      from vault.decrypted_secrets ds
      where ds.name = 'cobs_payment_reconcile_token'
      limit 1
    ),
    false
  );
$$;

revoke all on function public.verify_payment_reconcile_token(text) from public, anon, authenticated;
grant execute on function public.verify_payment_reconcile_token(text) to service_role;