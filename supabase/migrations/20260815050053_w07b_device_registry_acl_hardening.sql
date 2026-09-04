revoke execute on function public.register_my_device(uuid,public.device_platform,text,public.push_provider,text,text,text) from public,anon;
revoke execute on function public.refresh_my_push_token(uuid,public.push_provider,text,text) from public,anon;
revoke execute on function public.revoke_my_device(uuid,text,text) from public,anon;
revoke execute on function public.get_my_devices(uuid) from public,anon;
grant execute on function public.register_my_device(uuid,public.device_platform,text,public.push_provider,text,text,text) to authenticated;
grant execute on function public.refresh_my_push_token(uuid,public.push_provider,text,text) to authenticated;
grant execute on function public.revoke_my_device(uuid,text,text) to authenticated;
grant execute on function public.get_my_devices(uuid) to authenticated;