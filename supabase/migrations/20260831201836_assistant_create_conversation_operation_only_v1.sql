create or replace function public.assistant_create_conversation(
  _operation_id uuid,
  _channel text default 'app',
  _locale text default 'pt-BR',
  _title text default null
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _profile_id uuid := auth.uid();
  _tenant_id uuid;
  _id uuid;
begin
  if _profile_id is null then raise exception 'not_authenticated'; end if;
  if _operation_id is null then raise exception 'operation_required'; end if;

  select o.tenant_id into _tenant_id
  from public.operations o
  where o.id = _operation_id;

  if _tenant_id is null
     or not app_private.assistant_has_operation_access(_tenant_id, _operation_id, _profile_id) then
    raise exception 'assistant_access_denied';
  end if;

  if _channel not in ('app','web','internal') then raise exception 'invalid_channel'; end if;
  if _locale is null or length(_locale) not between 2 and 20 then raise exception 'invalid_locale'; end if;

  insert into public.assistant_conversations(
    tenant_id, operation_id, profile_id, channel, locale, title, last_message_at
  ) values (
    _tenant_id, _operation_id, _profile_id, _channel, _locale, nullif(btrim(_title),''), now()
  ) returning id into _id;

  return _id;
end;
$function$;

revoke all on function public.assistant_create_conversation(uuid,text,text,text) from public;
grant execute on function public.assistant_create_conversation(uuid,text,text,text) to authenticated;