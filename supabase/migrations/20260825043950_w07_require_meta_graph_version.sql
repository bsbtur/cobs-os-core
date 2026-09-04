create or replace function public.w07_get_meta_whatsapp_config()
returns jsonb
language sql
security definer
set search_path='pg_catalog','public','vault'
as $$
  select jsonb_build_object(
    'access_token', max(decrypted_secret) filter (where name='cobs_whatsapp_meta_access_token'),
    'phone_number_id', max(decrypted_secret) filter (where name='cobs_whatsapp_meta_phone_number_id'),
    'verify_token_configured', (max(decrypted_secret) filter (where name='cobs_whatsapp_meta_verify_token')) is not null,
    'app_secret_configured', (max(decrypted_secret) filter (where name='cobs_whatsapp_meta_app_secret')) is not null,
    'graph_version', max(decrypted_secret) filter (where name='cobs_whatsapp_meta_graph_version')
  )
  from vault.decrypted_secrets
  where name in ('cobs_whatsapp_meta_access_token','cobs_whatsapp_meta_phone_number_id','cobs_whatsapp_meta_verify_token','cobs_whatsapp_meta_app_secret','cobs_whatsapp_meta_graph_version');
$$;
revoke all on function public.w07_get_meta_whatsapp_config() from public,anon,authenticated;
grant execute on function public.w07_get_meta_whatsapp_config() to service_role;