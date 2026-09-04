create or replace function public.verify_automation_dispatcher_token(_token text)
returns boolean
language sql
security definer
set search_path to 'pg_catalog','vault'
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name='cobs_automation_dispatcher_token'
      and decrypted_secret = _token
  );
$$;
revoke all on function public.verify_automation_dispatcher_token(text) from public, anon, authenticated;
grant execute on function public.verify_automation_dispatcher_token(text) to service_role, postgres;
revoke execute on function app_private.verify_automation_dispatcher_token(text) from service_role;